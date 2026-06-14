import { Router, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import type { AuthRequest } from "../middleware/auth";
import { requireAuth, isAdmin } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import {
  runAnalysis,
  runMigration,
  pushMigratedCode,
  runBuildFixLoop,
  isSecretFile,
} from "../services/migrator";
import {
  createCheckoutForMigration,
  createCheckoutForOverage,
  createCheckoutForReview,
  verifyCheckoutPaid,
  addonTotalCents,
} from "../services/billing";
import type { CheckoutAddons } from "../services/billing";
import { calculateCost } from "../services/ai";
import * as vercelService from "../services/vercel";
import * as railwayService from "../services/railway";
import * as githubService from "../services/github";
import * as s3 from "../services/s3";
import {
  validateSupabaseConnectionString,
  readGeneratedSchema,
  applySchema,
} from "../services/schema-apply";
import { decryptSecret, encryptSecret } from "../utils/crypto";
import { redactSecrets } from "../utils/redact";
import { safeJoin } from "../utils/paths";
import AdmZip from "adm-zip";
import fs from "fs/promises";
import path from "path";
import os from "os";

const createMigrationSchema = z.object({
  project_id: z.string().uuid(),
}).strip();

const pushSchema = z.object({
  output_type: z.enum(["new", "fork", "branch"]),
  repo_name: z.string().min(1).max(200).regex(/^[a-zA-Z0-9._-]+$/, "Invalid repository name").optional(),
}).strip().refine(
  (d) => d.output_type !== "new" || !!d.repo_name,
  { message: "repo_name is required for new repositories", path: ["repo_name"] },
);

const retrySchema = z.object({
  model: z.string().max(100).optional(),
}).strip();

// .env payload is capped to avoid abuse; values are never persisted.
const envSchema = z.object({
  env: z.string().min(1).max(100_000),
}).strip();

const router = Router();

/**
 * Parse the contents of a .env file into key/value pairs, entirely in memory.
 * Handles `export ` prefixes, `#` comments, blank lines, surrounding single or
 * double quotes, and `=` characters inside values. Keys must match the standard
 * env var grammar; anything else is ignored.
 */
function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice("export ".length).trim();

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = line.slice(eq + 1).trim();
    // Strip a single layer of matching surrounding quotes.
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}


async function checkAnalysisQuota(
  userId: string,
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const user = await db("users").where({ id: userId }).first();
  const used = user.free_analyses_used || 0;
  const limit = user.free_analyses_limit || 2;
  return { allowed: used < limit, used, limit };
}

/**
 * Fetch a migration together with its owning project, verifying ownership in a
 * single step. Returns null if the migration does not exist OR is not owned by
 * the user — callers should respond with a uniform 404 to avoid leaking which
 * migration IDs exist (no enumeration via status-before-ownership checks).
 */
async function getOwnedMigration(
  migrationId: string | string[] | undefined,
  userId: string | undefined,
) {
  if (!migrationId || Array.isArray(migrationId) || !userId) return null;
  const migration = await db("migrations").where({ id: migrationId }).first();
  if (!migration) return null;
  const project = await db("projects")
    .where({ id: migration.project_id, user_id: userId })
    .first();
  if (!project) return null;
  return { migration, project };
}

router.post("/", requireAuth, validateBody(createMigrationSchema), async (req: AuthRequest, res: Response) => {
  const { project_id } = req.body;

  const project = await db("projects")
    .where({ id: project_id, user_id: req.userId })
    .first();

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Block re-analysis if project already has a completed analysis
  const existingAnalysis = await db("migrations")
    .where({ project_id })
    .whereIn("status", ["estimated", "confirmed", "running", "completed"])
    .first();

  if (existingAnalysis) {
    res.status(400).json({
      error: "already_analyzed",
      message:
        "This repository has already been analyzed. Proceed with the existing migration.",
      migration_id: existingAnalysis.id,
    });
    return;
  }

  // Check analysis quota (admins are exempt)
  if (!isAdmin(req.userEmail)) {
    const quota = await checkAnalysisQuota(req.userId!);
    if (!quota.allowed) {
      res.status(402).json({
        error: "analysis_quota_exceeded",
        message: "You've used all your free analyses. Pay to unlock more.",
        used: quota.used,
        limit: quota.limit,
      });
      return;
    }

    await db("users")
      .where({ id: req.userId })
      .increment("free_analyses_used", 1);
  }

  const [migration] = await db("migrations")
    .insert({ project_id })
    .returning("*");

  // Start analysis in background
  runAnalysis(migration.id).catch((err) => {
    console.error("[migration] Analysis error:", err);
  });

  res.status(201).json(migration);
});

router.get("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  const owned = await getOwnedMigration(req.params.id, req.userId);
  if (!owned) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const { migration, project } = owned;

  const files = await db("migration_files")
    .where({ migration_id: migration.id })
    .whereNot({ status: "skipped" })
    .select(
      "id",
      "file_path",
      "status",
      "changes_summary",
      "input_tokens",
      "output_tokens",
      "created_at",
    )
    .orderBy("file_path");

  res.json({
    ...migration,
    is_deployed: project.status === "deployed",
    supabase_url: project.supabase_url,
    supabase_anon_key: project.supabase_anon_key,
    has_db_url: !!project.supabase_db_url,
    has_review_artifact: !!migration.review_artifact_key,
    files,
  });
});

// Customer download of the reviewed code the admin delivered. We mint a
// short-lived presigned GET URL (the bucket stays private) and force a
// sensible download filename.
router.get(
  "/:id/review-download",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const owned = await getOwnedMigration(req.params.id, req.userId);
    if (!owned) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { migration } = owned;
    if (!migration.review_artifact_key) {
      res.status(404).json({ error: "No reviewed code is available yet" });
      return;
    }
    const filename = migration.review_artifact_name || "reviewed-code.zip";
    const url = await s3.getPresignedDownloadUrl(migration.review_artifact_key, 300, {
      downloadFilename: filename,
    });
    res.json({ url, name: filename });
  },
);

// Push the reviewed code straight to the customer's GitHub repo on a dedicated
// branch, so they can diff/merge it. We unzip the reviewer's archive in memory,
// guard against zip-slip and secret files, then force-push to a review branch.
const REVIEW_BRANCH = "yougrate/reviewed";

router.post(
  "/:id/push-review",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const owned = await getOwnedMigration(req.params.id, req.userId);
    if (!owned) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { migration, project } = owned;

    if (!migration.review_artifact_key) {
      res.status(400).json({ error: "No reviewed code is available to push yet." });
      return;
    }

    const user = await db("users").where({ id: project.user_id }).first();
    if (!user?.github_access_token) {
      res.status(400).json({
        error: "github_not_connected",
        needs_github_connect: true,
        message: "Connect your GitHub account to push the reviewed code.",
      });
      return;
    }
    const token = decryptSecret(user.github_access_token);

    // The migration may have produced a brand-new repo (output_type "new");
    // in that case push the review branch there. Otherwise the migrated code
    // lives on the original repo, so target that.
    let targetRepoFullName = project.github_repo_full_name;
    let targetRepoUrl = project.github_repo_url;
    if (migration.output_type === "new" && migration.output_repo_url) {
      const fullName = migration.output_repo_url
        .replace(/^https?:\/\/github\.com\//, "")
        .replace(/\.git$/, "")
        .replace(/\/$/, "");
      if (fullName.split("/").length === 2) {
        targetRepoFullName = fullName;
        targetRepoUrl = migration.output_repo_url;
      }
    }

    const tmpDir = path.join(os.tmpdir(), `yougrate-review-${Date.now()}`);
    try {
      const buffer = await s3.downloadBuffer(migration.review_artifact_key);

      const zip = new AdmZip(buffer);
      let written = 0;
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue;
        // Guard against zip-slip; never write outside the temp dir.
        const dest = safeJoin(tmpDir, entry.entryName);
        if (!dest) continue;
        // Defensive: never propagate committed secrets even if present.
        if (isSecretFile(entry.entryName)) continue;
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, entry.getData());
        written++;
      }

      if (written === 0) {
        res.status(400).json({ error: "The reviewed archive contained no usable files." });
        return;
      }

      await githubService.pushToRepo(
        token,
        tmpDir,
        targetRepoFullName,
        REVIEW_BRANCH,
        "Reviewed code from Yougrate",
      );

      const branchUrl = `${targetRepoUrl}/tree/${REVIEW_BRANCH}`;
      res.json({ ok: true, branch: REVIEW_BRANCH, branch_url: branchUrl });
    } catch (err) {
      console.error(
        `[migration] push-review failed for ${migration.id}:`,
        err instanceof Error ? redactSecrets(err.message) : String(err),
      );
      res.status(500).json({
        error: redactSecrets(err instanceof Error ? err.message : "Failed to push reviewed code"),
      });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  },
);

const confirmSchema = z.object({
  addon_code_review: z.boolean().optional(),
}).strip();

router.post(
  "/:id/confirm",
  requireAuth,
  validateBody(confirmSchema),
  async (req: AuthRequest, res: Response) => {
    const owned = await getOwnedMigration(req.params.id, req.userId);
    if (!owned) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { migration } = owned;
    if (migration.status !== "estimated") {
      res.status(400).json({ error: "Migration must be in estimated status" });
      return;
    }

    const user = await db("users").where({ id: req.userId }).first();
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const addons: CheckoutAddons = {
      codeReview: req.body.addon_code_review ?? false,
    };

    await db("migrations").where({ id: migration.id }).update({
      // Schema/table generation is now standard (bundled into the base fee).
      addon_data_migration: true,
      addon_code_review: addons.codeReview,
    });

    if (isAdmin(req.userEmail)) {
      await db("migrations")
        .where({ id: migration.id })
        .update({ status: "confirmed" });
      runMigration(migration.id).catch((err) => {
        console.error("[migration] Migration error:", err);
      });
      res.json({ paid: true, status: "confirmed" });
      return;
    }

    const totalTokens =
      migration.estimated_input_tokens + migration.estimated_output_tokens;
    const { checkoutUrl } = await createCheckoutForMigration(
      req.userId!,
      user.email,
      migration.id,
      migration.estimated_cost_cents,
      totalTokens,
      addons,
    );

    res.json({ checkout_url: checkoutUrl });
  },
);

router.post(
  "/:id/verify-payment",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const owned = await getOwnedMigration(req.params.id, req.userId);
    if (!owned) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { migration } = owned;
    if (migration.status !== "estimated") {
      res.status(400).json({ error: "Migration not awaiting payment" });
      return;
    }

    const billingEvent = await db("billing_events")
      .where({ migration_id: migration.id })
      .orderBy("created_at", "desc")
      .first();

    if (!billingEvent?.stripe_invoice_id) {
      res.status(400).json({ error: "No payment session found" });
      return;
    }

    const paid = await verifyCheckoutPaid(billingEvent.stripe_invoice_id);
    if (!paid) {
      res.json({ paid: false });
      return;
    }

    await db("billing_events")
      .where({ id: billingEvent.id, status: "pending" })
      .update({ status: "paid" });

    const updated = await db("migrations")
      .where({ id: migration.id, status: "estimated" })
      .update({ status: "confirmed" });

    if (updated > 0) {
      runMigration(migration.id).catch((err) => {
        console.error("[migration] Migration error:", err);
      });
    }

    res.json({ paid: true, status: "confirmed" });
  },
);

router.post(
  "/:id/push",
  requireAuth,
  validateBody(pushSchema),
  async (req: AuthRequest, res: Response) => {
    const { output_type, repo_name } = req.body;

    const owned = await getOwnedMigration(req.params.id, req.userId);
    if (!owned) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { migration, project } = owned;
    if (!["completed", "reviewed"].includes(migration.status)) {
      res.status(400).json({ error: "Migration must be completed or reviewed" });
      return;
    }

    // Pushing to the ORIGINAL repo (branch/fork modes) requires write access to it.
    // "new" creates a fresh repo under the user's own account, so no check needed.
    if (output_type !== "new") {
      const pushUser = await db("users").where({ id: req.userId }).first();
      if (!pushUser?.github_access_token) {
        res.status(400).json({ error: "GitHub not connected" });
        return;
      }
      try {
        const repoInfo = await githubService.getRepoInfo(
          decryptSecret(pushUser.github_access_token),
          project.github_repo_full_name,
        );
        if (!repoInfo || !repoInfo.permissions.push) {
          res.status(403).json({
            error: "no_push_access",
            message:
              "Your GitHub account does not have write access to the original repository. Use 'New Repository' instead.",
          });
          return;
        }
      } catch (err: unknown) {
        if ((err as { status?: number }).status === 401) {
          res.status(401).json({ error: "github_token_expired", message: "Reconnect GitHub in Settings." });
          return;
        }
        throw err;
      }
    }

    try {
      const result = await pushMigratedCode(
        migration.id,
        output_type,
        repo_name,
      );
      res.json(result);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      let message = raw;
      if (raw.includes("already exists")) {
        message = `A repository named "${repo_name}" already exists on your GitHub account. Choose a different name.`;
      } else if (raw.includes("Not Found") || raw.includes("404")) {
        message =
          "GitHub repository not found. Make sure your GitHub account is still connected.";
      } else if (raw.includes("Bad credentials") || raw.includes("401")) {
        message =
          "GitHub authentication expired. Please reconnect your GitHub account.";
      } else if (raw.includes("specified key does not exist")) {
        message =
          "Some migrated files could not be found. Try re-running the migration.";
      } else if (raw.includes("src refspec")) {
        message =
          "Failed to push code — the repository may be in an unexpected state. Try creating a new repository.";
      }
      console.error("[push] Error:", redactSecrets(raw));
      res.status(500).json({ error: message });
    }
  },
);

router.post(
  "/:id/deploy",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const owned = await getOwnedMigration(req.params.id, req.userId);
    if (!owned) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { migration, project } = owned;
    if (!migration.output_repo_url) {
      res.status(400).json({ error: "Code must be pushed first" });
      return;
    }

    const user = await db("users").where({ id: req.userId }).first();
    if (!user?.vercel_access_token) {
      res.status(400).json({ error: "Vercel not connected" });
      return;
    }

    try {
      await db("migrations")
        .where({ id: migration.id })
        .update({ status: "building" });
      await db("projects")
        .where({ id: project.id })
        .update({ status: "deploying" });

      const repoFullName = migration.output_repo_url.replace(
        "https://github.com/",
        "",
      );
      let vercelProject = await vercelService.getProject(
        decryptSecret(user.vercel_access_token),
        project.name,
      );

      if (!vercelProject) {
        vercelProject = await vercelService.createProject(
          decryptSecret(user.vercel_access_token),
          project.name,
          repoFullName,
          {
            NEXT_PUBLIC_SUPABASE_URL: project.supabase_url || "",
            NEXT_PUBLIC_SUPABASE_ANON_KEY: project.supabase_anon_key || "",
          },
        );
      }

      const repoId = vercelProject.link?.repoId;
      const deployment = await vercelService.triggerDeployment(
        decryptSecret(user.vercel_access_token),
        vercelProject.name,
        migration.output_branch || "main",
        repoId,
      );

      runBuildFixLoop(migration.id, deployment.id).catch(async (err) => {
        console.error("[deploy] Build fix loop error:", err);
        const msg = err instanceof Error ? err.message : String(err);
        await db("migrations")
          .where({ id: migration.id })
          .update({ status: "failed", error_message: `Deploy failed: ${msg}` });
        await db("projects")
          .where({ id: project.id })
          .update({ status: "failed" });
      });

      res.json({
        vercel_project: vercelProject,
        deployment,
      });
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      let message = raw;
      if (raw.includes("not_authorized") || raw.includes("403")) {
        message =
          "Vercel authorization failed. Please reconnect your Vercel account.";
      } else if (raw.includes("already exists") || raw.includes("conflict")) {
        message =
          "A Vercel project with this name already exists. Try renaming your project.";
      } else if (raw.includes("repoId")) {
        message =
          "Could not link the GitHub repo to Vercel. Make sure your Vercel account has access to the repository.";
      }
      console.error("[deploy] Error:", redactSecrets(raw));
      await db("migrations")
        .where({ id: migration.id })
        .update({ status: "completed" });
      await db("projects")
        .where({ id: project.id })
        .update({ status: "migrated" });
      res.status(500).json({ error: message });
    }
  },
);

router.post(
  "/:id/env",
  requireAuth,
  validateBody(envSchema),
  async (req: AuthRequest, res: Response) => {
    const owned = await getOwnedMigration(req.params.id, req.userId);
    if (!owned) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { project } = owned;

    const user = await db("users").where({ id: req.userId }).first();
    if (!user?.vercel_access_token) {
      res.status(400).json({ error: "Vercel not connected" });
      return;
    }

    const token = decryptSecret(user.vercel_access_token);

    // The Vercel project must already exist (created during deploy) before we
    // can attach env vars to it.
    const vercelProject = await vercelService.getProject(token, project.name);
    if (!vercelProject) {
      res.status(400).json({
        error:
          "No Vercel project found yet. Deploy your app first, then add environment variables.",
      });
      return;
    }

    const vars = parseEnvText(req.body.env);
    const count = Object.keys(vars).length;
    if (count === 0) {
      res
        .status(400)
        .json({ error: "No valid environment variables found in the input." });
      return;
    }

    try {
      const keys = await vercelService.upsertEnvVars(
        token,
        vercelProject.id || vercelProject.name,
        vars,
      );
      res.json({ keys, count: keys.length });
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      let message = "Failed to push environment variables to Vercel.";
      if (raw.includes("not_authorized") || raw.includes("403")) {
        message =
          "Vercel authorization failed. Please reconnect your Vercel account.";
      }
      // raw may echo the Vercel error body but never the submitted values.
      console.error("[env] Error:", redactSecrets(raw));
      res.status(500).json({ error: message });
    }
  },
);

router.post(
  "/:id/deploy-railway",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const owned = await getOwnedMigration(req.params.id, req.userId);
    if (!owned) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { migration, project } = owned;

    if (migration.backend_type !== "server") {
      res.status(400).json({
        error: "This migration doesn't need a persistent backend server.",
      });
      return;
    }
    if (!migration.output_repo_url) {
      res
        .status(400)
        .json({ error: "Push your code to GitHub before deploying to Railway." });
      return;
    }

    const user = await db("users").where({ id: req.userId }).first();
    if (!user?.railway_access_token) {
      res.status(400).json({ error: "Railway not connected" });
      return;
    }
    const token = decryptSecret(user.railway_access_token);

    const repo = migration.output_repo_url.replace(
      "https://github.com/",
      "",
    );
    const branch = migration.output_branch || "main";

    // Guided GitHub check: Railway can only build a repo it has access to. If we
    // can enumerate the linked account's repos and this one isn't there, tell
    // the user to authorize Railway on GitHub instead of failing cryptically.
    const accessible = await railwayService.getAccessibleRepos(token);
    if (accessible && !accessible.includes(repo)) {
      res.status(400).json({
        error:
          "Railway can't access this repository yet. Connect Railway to your GitHub account and grant it access to this repo, then try again.",
        needs_github_connect: true,
        github_app_url: "https://github.com/apps/railway/installations/new",
      });
      return;
    }

    const details =
      (migration.backend_details as {
        server_dir?: string;
        start_command?: string;
      } | null) || {};
    const rootDirectory =
      details.server_dir && details.server_dir !== "."
        ? details.server_dir
        : undefined;

    try {
      const serviceName = `${project.name}-api`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .slice(0, 60);

      const { projectId, environmentId } = await railwayService.createProject(
        token,
        serviceName,
      );
      const serviceId = await railwayService.createService(
        token,
        projectId,
        serviceName,
      );
      await railwayService.connectRepo(token, serviceId, repo, branch);
      await railwayService.configureService(token, serviceId, environmentId, {
        rootDirectory,
        startCommand: details.start_command,
      });

      let domain: string | null = null;
      try {
        domain = await railwayService.createServiceDomain(
          token,
          environmentId,
          serviceId,
        );
      } catch (e) {
        console.error(
          "[railway] domain create failed:",
          redactSecrets(e instanceof Error ? e.message : String(e)),
        );
      }

      const deploymentId = await railwayService.deployService(
        token,
        serviceId,
        environmentId,
      );

      await db("migrations").where({ id: migration.id }).update({
        railway_project_id: projectId,
        railway_service_id: serviceId,
        railway_environment_id: environmentId,
        railway_service_domain: domain,
        railway_deployment_id: deploymentId,
        updated_at: new Date().toISOString(),
      });

      // Best-effort: expose the backend URL to the Vercel frontend so it can
      // reach the API without the user wiring it up manually.
      let apiUrlWired = false;
      const apiUrl = domain ? `https://${domain}` : null;
      if (apiUrl && user.vercel_access_token) {
        try {
          const vercelToken = decryptSecret(user.vercel_access_token);
          const vercelProject = await vercelService.getProject(
            vercelToken,
            project.name,
          );
          if (vercelProject) {
            await vercelService.upsertEnvVars(
              vercelToken,
              vercelProject.id || vercelProject.name,
              {
                VITE_API_URL: apiUrl,
                NEXT_PUBLIC_API_URL: apiUrl,
              },
            );
            apiUrlWired = true;
          }
        } catch (e) {
          console.error(
            "[railway] wiring API URL into Vercel failed:",
            redactSecrets(e instanceof Error ? e.message : String(e)),
          );
        }
      }

      res.json({
        project_id: projectId,
        service_id: serviceId,
        environment_id: environmentId,
        domain,
        api_url: apiUrl,
        api_url_wired: apiUrlWired,
        deployment_id: deploymentId,
      });
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      let message = "Failed to deploy backend to Railway.";
      const low = raw.toLowerCase();
      if (low.includes("not authorized") || low.includes("unauthorized")) {
        message =
          "Railway authorization failed. Reconnect your Railway account in Settings.";
      } else if (low.includes("repo") || low.includes("github")) {
        message =
          "Railway couldn't access the repository. Make sure Railway is connected to GitHub with access to this repo.";
      }
      console.error("[railway] deploy error:", redactSecrets(raw));
      res.status(500).json({ error: message });
    }
  },
);

router.post(
  "/:id/railway-env",
  requireAuth,
  validateBody(envSchema),
  async (req: AuthRequest, res: Response) => {
    const owned = await getOwnedMigration(req.params.id, req.userId);
    if (!owned) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { migration } = owned;

    if (
      !migration.railway_service_id ||
      !migration.railway_environment_id ||
      !migration.railway_project_id
    ) {
      res
        .status(400)
        .json({ error: "Deploy the backend to Railway first." });
      return;
    }

    const user = await db("users").where({ id: req.userId }).first();
    if (!user?.railway_access_token) {
      res.status(400).json({ error: "Railway not connected" });
      return;
    }

    const vars = parseEnvText(req.body.env);
    if (Object.keys(vars).length === 0) {
      res
        .status(400)
        .json({ error: "No valid environment variables found in the input." });
      return;
    }

    try {
      const keys = await railwayService.setVariables(
        decryptSecret(user.railway_access_token),
        {
          projectId: migration.railway_project_id,
          environmentId: migration.railway_environment_id,
          serviceId: migration.railway_service_id,
        },
        vars,
      );
      res.json({ keys, count: keys.length });
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      console.error("[railway-env] Error:", redactSecrets(raw));
      res
        .status(500)
        .json({ error: "Failed to push environment variables to Railway." });
    }
  },
);

router.get(
  "/:id/railway-status",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const owned = await getOwnedMigration(req.params.id, req.userId);
    if (!owned) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { migration } = owned;

    if (
      !migration.railway_service_id ||
      !migration.railway_environment_id ||
      !migration.railway_project_id
    ) {
      res.json({ deployed: false, status: null });
      return;
    }

    const user = await db("users").where({ id: req.userId }).first();
    if (!user?.railway_access_token) {
      res.json({ deployed: true, status: null });
      return;
    }

    const result = await railwayService.getLatestDeploymentStatus(
      decryptSecret(user.railway_access_token),
      {
        projectId: migration.railway_project_id,
        environmentId: migration.railway_environment_id,
        serviceId: migration.railway_service_id,
      },
    );
    res.json({
      deployed: true,
      status: result?.status ?? null,
      domain: migration.railway_service_domain,
    });
  },
);

router.post(
  "/:id/pay-overage",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const owned = await getOwnedMigration(req.params.id, req.userId);
    if (!owned) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { migration } = owned;
    if (migration.status !== "budget_exceeded") {
      res
        .status(400)
        .json({ error: "Migration is not awaiting overage payment" });
      return;
    }

    const user = await db("users").where({ id: req.userId }).first();
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const filesCompleted = migration.files_migrated || 0;
    const filesRemaining = (migration.files_to_migrate || 0) - filesCompleted;
    const tokensUsed =
      (migration.actual_input_tokens || 0) +
      (migration.actual_output_tokens || 0);

    if (filesCompleted === 0 || filesRemaining === 0) {
      res.status(400).json({ error: "Cannot calculate overage" });
      return;
    }

    const tokensPerFile = tokensUsed / filesCompleted;
    const projectedRemainingTokens = Math.ceil(
      tokensPerFile * filesRemaining * 1.1,
    );
    const inputRatio = (migration.actual_input_tokens || 0) / tokensUsed;
    const projectedRemainingInput = Math.ceil(
      projectedRemainingTokens * inputRatio,
    );
    const projectedRemainingOutput =
      projectedRemainingTokens - projectedRemainingInput;
    const remainingCost = calculateCost(
      projectedRemainingInput,
      projectedRemainingOutput,
    );
    const overageCents = Math.max(remainingCost.tokenCostCents, 100);

    if (isAdmin(req.userEmail)) {
      await db("migrations")
        .where({ id: migration.id })
        .update({ status: "running" });
      runMigration(migration.id).catch((err) => {
        console.error("[migration] Migration error:", err);
      });
      res.json({ paid: true, status: "running" });
      return;
    }

    const { checkoutUrl } = await createCheckoutForOverage(
      req.userId!,
      user.email,
      migration.id,
      overageCents,
      projectedRemainingTokens,
    );

    res.json({ checkout_url: checkoutUrl, overage_cents: overageCents });
  },
);

router.post(
  "/:id/verify-overage",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const owned = await getOwnedMigration(req.params.id, req.userId);
    if (!owned) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { migration } = owned;
    if (migration.status !== "budget_exceeded") {
      res
        .status(400)
        .json({ error: "Migration is not awaiting overage payment" });
      return;
    }

    const billingEvent = await db("billing_events")
      .where({ migration_id: migration.id, status: "pending" })
      .orderBy("created_at", "desc")
      .first();

    if (!billingEvent?.stripe_invoice_id) {
      res.status(400).json({ error: "No payment session found" });
      return;
    }

    const paid = await verifyCheckoutPaid(billingEvent.stripe_invoice_id);
    if (!paid) {
      res.json({ paid: false });
      return;
    }

    await db("billing_events")
      .where({ id: billingEvent.id, status: "pending" })
      .update({ status: "paid" });

    const filesCompleted = migration.files_migrated || 0;
    const filesRemaining = (migration.files_to_migrate || 0) - filesCompleted;
    const tokensUsed =
      (migration.actual_input_tokens || 0) +
      (migration.actual_output_tokens || 0);
    const tokensPerFile = tokensUsed / filesCompleted;
    const projectedRemainingTokens = Math.ceil(
      tokensPerFile * filesRemaining * 1.1,
    );
    const inputRatio = (migration.actual_input_tokens || 0) / tokensUsed;

    const newEstimatedInput =
      (migration.actual_input_tokens || 0) +
      Math.ceil(projectedRemainingTokens * inputRatio);
    const newEstimatedOutput =
      (migration.actual_output_tokens || 0) +
      (projectedRemainingTokens -
        Math.ceil(projectedRemainingTokens * inputRatio));

    const updated = await db("migrations")
      .where({ id: migration.id, status: "budget_exceeded" })
      .update({
        status: "confirmed",
        estimated_input_tokens: newEstimatedInput,
        estimated_output_tokens: newEstimatedOutput,
        estimated_cost_cents:
          (migration.estimated_cost_cents || 0) +
          billingEvent.billed_cost_cents,
        error_message: null,
      });

    if (updated > 0) {
      runMigration(migration.id).catch((err) => {
        console.error("[migration] Overage migration error:", err);
      });
    }

    res.json({ paid: true, status: "confirmed" });
  },
);

router.post(
  "/:id/retry",
  requireAuth,
  validateBody(retrySchema),
  async (req: AuthRequest, res: Response) => {
    const { model } = req.body;

    const owned = await getOwnedMigration(req.params.id, req.userId);
    if (!owned) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { migration, project } = owned;
    if (!["failed", "running", "analyzing"].includes(migration.status)) {
      res
        .status(400)
        .json({
          error: "Migration must be in a failed or stalled state to retry",
        });
      return;
    }

    const retryCount = migration.retry_count || 0;

    // Determine whether to retry analysis or migration execution
    const hasCompletedFiles = await db("migration_files")
      .where({ migration_id: migration.id, status: "completed" })
      .first();
    const hasIncompleteFiles = await db("migration_files")
      .where({ migration_id: migration.id })
      .whereIn("status", ["pending", "migrating", "failed"])
      .first();

    const isMigrationRetry =
      migration.status === "running" ||
      (hasIncompleteFiles && hasCompletedFiles);

    if (isMigrationRetry) {
      // Failed during migration execution — resume from where it left off
      await db("migrations")
        .where({ id: migration.id })
        .update({
          status: "running",
          error_message: null,
          retry_count: retryCount + 1,
        });
      await db("projects")
        .where({ id: project.id })
        .update({ status: "migrating" });

      // Reset failed and stuck migrating files back to pending for another attempt
      await db("migration_files")
        .where({ migration_id: migration.id })
        .whereIn("status", ["migrating", "failed"])
        .update({ status: "pending" });

      runMigration(migration.id).catch((err) => {
        console.error("[migration] Migration retry error:", err);
      });

      res.json({
        status: "retrying_migration",
        retry_count: retryCount + 1,
      });
    } else {
      // Failed during analysis — resume analysis from cache
      await db("migrations")
        .where({ id: migration.id })
        .update({
          status: "pending",
          error_message: null,
          migration_log: "[]",
          retry_count: retryCount + 1,
        });
      await db("projects")
        .where({ id: project.id })
        .update({ status: "analyzing" });

      runAnalysis(migration.id, model || undefined).catch((err) => {
        console.error("[migration] Analysis retry error:", err);
      });

      res.json({
        status: "retrying_analysis",
        model: model || "default",
        retry_count: retryCount + 1,
      });
    }
  },
);

router.post(
  "/:id/request-review",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const owned = await getOwnedMigration(req.params.id, req.userId);
    if (!owned) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { migration } = owned;
    if (!["completed", "failed", "reviewed"].includes(migration.status)) {
      res.status(400).json({ error: "Migration must be completed or failed to request a review" });
      return;
    }

    // Already paid for (e.g. purchased as an add-on during checkout): grant directly.
    if (migration.addon_code_review || isAdmin(req.userEmail)) {
      await db("migrations")
        .where({ id: migration.id })
        .update({ status: "pending_review", addon_code_review: true });
      res.json({ status: "pending_review" });
      return;
    }

    const user = await db("users").where({ id: req.userId }).first();
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const { checkoutUrl } = await createCheckoutForReview(
      req.userId!,
      user.email,
      migration.id,
    );

    res.json({ checkout_url: checkoutUrl });
  },
);

const applySchemaSchema = z
  .object({
    connection_string: z.string().min(1).max(1000).optional(),
    save: z.boolean().optional(),
  })
  .strip();

router.post(
  "/:id/apply-schema",
  requireAuth,
  validateBody(applySchemaSchema),
  async (req: AuthRequest, res: Response) => {
    const owned = await getOwnedMigration(req.params.id, req.userId);
    if (!owned) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { migration, project } = owned;

    if (!migration.addon_data_migration) {
      res.status(400).json({
        error:
          "No generated schema for this migration — the data migration add-on was not used.",
      });
      return;
    }
    if (!["completed", "reviewed"].includes(migration.status)) {
      res
        .status(400)
        .json({ error: "Migration must be completed before applying the schema" });
      return;
    }

    // Prefer a connection string supplied now; otherwise reuse the stored one.
    const supplied = req.body.connection_string?.trim();
    const connectionString = supplied || decryptSecret(project.supabase_db_url);
    if (!connectionString) {
      res
        .status(400)
        .json({ error: "Provide your Supabase database connection string." });
      return;
    }

    const valid = validateSupabaseConnectionString(connectionString);
    if (!valid.ok) {
      res.status(400).json({ error: valid.error });
      return;
    }

    const s3Prefix = s3.getWorkspacePrefix(project.id, migration.id);
    const sql = await readGeneratedSchema(s3Prefix);
    if (!sql) {
      res.status(400).json({
        error:
          "Generated schema file not found. Re-run the migration with the data migration add-on.",
      });
      return;
    }

    const result = await applySchema(connectionString, sql);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }

    // Persist the connection string (encrypted) only if the user opted in.
    if (supplied && req.body.save) {
      await db("projects")
        .where({ id: project.id })
        .update({
          supabase_db_url: encryptSecret(connectionString),
          updated_at: new Date().toISOString(),
        });
    }

    res.json({ ok: true });
  },
);

router.post(
  "/:id/verify-review",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const owned = await getOwnedMigration(req.params.id, req.userId);
    if (!owned) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { migration } = owned;

    const billingEvent = await db("billing_events")
      .where({ migration_id: migration.id, status: "pending" })
      .orderBy("created_at", "desc")
      .first();

    if (!billingEvent?.stripe_invoice_id) {
      res.status(400).json({ error: "No payment session found" });
      return;
    }

    const paid = await verifyCheckoutPaid(billingEvent.stripe_invoice_id);
    if (!paid) {
      res.json({ paid: false });
      return;
    }

    await db("billing_events")
      .where({ id: billingEvent.id, status: "pending" })
      .update({ status: "paid" });

    await db("migrations")
      .where({ id: migration.id })
      .whereIn("status", ["completed", "failed", "reviewed"])
      .update({ status: "pending_review", addon_code_review: true });

    res.json({ paid: true, status: "pending_review" });
  },
);

export default router;
