import { Router, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { ANTHROPIC_PRICING } from "../types";
import type { AuthRequest } from "../middleware/auth";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { validateBody, validateQuery } from "../middleware/validate";
import { getPresignedDownloadUrl } from "../services/s3";
import * as s3 from "../services/s3";
import { getPresignedUploadUrl } from "../services/s3";
import { isSecretFile } from "../services/migrator";
import { sendReviewDelivered } from "../services/email";
import { createClient } from "@supabase/supabase-js";
import archiver = require("archiver");
import crypto from "crypto";

let _supabaseAdmin: ReturnType<typeof createClient> | null = null;
function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    );
  }
  return _supabaseAdmin;
}

const AI_MODEL = (process.env.AI_MODEL || "claude-opus-4-7") as keyof typeof ANTHROPIC_PRICING;

function rawAnthropicCostCents(inputTokens: number, outputTokens: number): number {
  const pricing = ANTHROPIC_PRICING[AI_MODEL] || ANTHROPIC_PRICING["claude-opus-4-7"];
  return Math.ceil(
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output,
  );
}

/**
 * Total API cost we actually incurred for a migration: the analysis pass
 * (always runs, often the only cost when a migration is never executed) PLUS
 * the migration-execution tokens.
 */
function totalApiCostCents(m: {
  analysis_input_tokens?: number | null;
  analysis_output_tokens?: number | null;
  actual_input_tokens?: number | null;
  actual_output_tokens?: number | null;
}): number {
  return rawAnthropicCostCents(
    (Number(m.analysis_input_tokens) || 0) + (Number(m.actual_input_tokens) || 0),
    (Number(m.analysis_output_tokens) || 0) + (Number(m.actual_output_tokens) || 0),
  );
}

const usersQuerySchema = z.object({
  search: z.string().max(200).optional(),
  page: z.string().regex(/^\d+$/).optional().default("1"),
  limit: z.string().regex(/^\d+$/).optional().default("50"),
}).strip();

const ticketsQuerySchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  type: z.enum(["bug", "feature", "question", "other"]).optional(),
  page: z.string().regex(/^\d+$/).optional().default("1"),
  limit: z.string().regex(/^\d+$/).optional().default("50"),
}).strip();

const updateTicketSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  admin_notes: z.string().max(5000).optional(),
}).strip();

const router = Router();

router.use(requireAuth, requireAdmin);

router.get("/stats", async (_req: AuthRequest, res: Response) => {
  const [userCount] = await db("users").count("id as count");
  const [migrationCount] = await db("migrations").count("id as count");
  const [ticketCount] = await db("support_tickets").where({ status: "open" }).count("id as count");
  const [revenue] = await db("billing_events").where({ status: "paid" }).sum("billed_cost_cents as total");
  const [pendingReviews] = await db("migrations").whereIn("status", ["pending_review", "reviewing"]).count("id as count");

  const anthropicTokens = await db("migrations")
    .select(
      db.raw("COALESCE(SUM(actual_input_tokens), 0) as total_input"),
      db.raw("COALESCE(SUM(actual_output_tokens), 0) as total_output"),
      db.raw("COALESCE(SUM(analysis_input_tokens), 0) as analysis_input"),
      db.raw("COALESCE(SUM(analysis_output_tokens), 0) as analysis_output"),
    )
    .first();

  const totalRevenueCents = Number(revenue.total) || 0;
  const totalAnthropicCostCents = rawAnthropicCostCents(
    (Number(anthropicTokens?.total_input) || 0) + (Number(anthropicTokens?.analysis_input) || 0),
    (Number(anthropicTokens?.total_output) || 0) + (Number(anthropicTokens?.analysis_output) || 0),
  );

  res.json({
    total_users: Number(userCount.count),
    total_migrations: Number(migrationCount.count),
    open_tickets: Number(ticketCount.count),
    pending_reviews: Number(pendingReviews.count),
    total_revenue_cents: totalRevenueCents,
    anthropic_cost_cents: totalAnthropicCostCents,
    anthropic_margin_cents: totalRevenueCents - totalAnthropicCostCents,
    anthropic_tokens: {
      total_input: Number(anthropicTokens?.total_input) || 0,
      total_output: Number(anthropicTokens?.total_output) || 0,
      analysis_input: Number(anthropicTokens?.analysis_input) || 0,
      analysis_output: Number(anthropicTokens?.analysis_output) || 0,
    },
  });
});

router.get("/cost-breakdown", async (_req: AuthRequest, res: Response) => {
  const migrations = await db("migrations")
    .join("projects", "migrations.project_id", "projects.id")
    .join("users", "projects.user_id", "users.id")
    .select(
      "migrations.id",
      "migrations.project_id",
      "migrations.status",
      "migrations.detected_platform",
      "migrations.files_to_migrate",
      "migrations.files_migrated",
      "migrations.actual_input_tokens",
      "migrations.actual_output_tokens",
      "migrations.analysis_input_tokens",
      "migrations.analysis_output_tokens",
      "migrations.actual_cost_cents",
      "migrations.estimated_cost_cents",
      "migrations.created_at",
      "projects.name as project_name",
      "users.email as user_email",
    )
    .where("migrations.actual_cost_cents", ">", 0)
    .orderBy("migrations.created_at", "desc")
    .limit(100);

  const billingByMigration = await db("billing_events")
    .whereNotNull("migration_id")
    .select("migration_id", "status")
    .sum("billed_cost_cents as revenue_cents")
    .groupBy("migration_id", "status");

  const revenueMap = new Map<string, number>();
  const paymentStatusMap = new Map<string, string>();

  for (const b of billingByMigration as Array<Record<string, unknown>>) {
    const mid = String(b.migration_id);
    const status = String(b.status);
    const amount = Number(b.revenue_cents) || 0;

    if (status === "paid") {
      revenueMap.set(mid, (revenueMap.get(mid) || 0) + amount);
    }

    const current = paymentStatusMap.get(mid);
    if (status === "paid") paymentStatusMap.set(mid, "paid");
    else if (status === "refunded") paymentStatusMap.set(mid, "refunded");
    else if (!current) paymentStatusMap.set(mid, status);
  }

  const rows = migrations.map((m: Record<string, unknown>) => {
    const rev = revenueMap.get(m.id as string) || 0;
    const apiCost = totalApiCostCents(m);
    return {
      ...m,
      raw_cost_cents: apiCost,
      revenue_cents: rev,
      margin_cents: rev - apiCost,
      payment_status: paymentStatusMap.get(m.id as string) || "unpaid",
    };
  });

  res.json(rows);
});

router.get("/users", validateQuery(usersQuerySchema), async (req: AuthRequest, res: Response) => {
  const { search, page = "1", limit = "50" } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let query = db("users").select(
    "id", "email", "name", "avatar_url", "github_username",
    "free_analyses_used", "free_analyses_limit",
    "created_at", "updated_at",
    db.raw("github_access_token IS NOT NULL as github_connected"),
    db.raw("vercel_access_token IS NOT NULL as vercel_connected"),
    db.raw("stripe_customer_id IS NOT NULL as has_stripe"),
  );

  if (search) {
    const s = `%${search}%`;
    query = query.where((qb) => {
      qb.whereILike("email", s).orWhereILike("name", s).orWhereILike("github_username", s);
    });
  }

  const [total] = await query.clone().clearSelect().count("id as count");
  const users = await query.orderBy("created_at", "desc").limit(Number(limit)).offset(offset);

  res.json({ users, total: Number(total.count), page: Number(page), limit: Number(limit) });
});

router.get("/users/:id", async (req: AuthRequest, res: Response) => {
  const user = await db("users").where({ id: req.params.id }).first();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    ...user,
    github_connected: !!user.github_access_token,
    vercel_connected: !!user.vercel_access_token,
    github_access_token: undefined,
    vercel_access_token: undefined,
  });
});

router.get("/users/:id/projects", async (req: AuthRequest, res: Response) => {
  const projects = await db("projects")
    .select("id", "user_id", "name", "github_repo_url", "github_repo_full_name", "default_branch", "status", "created_at", "updated_at")
    .where({ user_id: req.params.id })
    .orderBy("created_at", "desc");
  res.json(projects);
});

router.get("/users/:id/migrations", async (req: AuthRequest, res: Response) => {
  const migrations = await db("migrations")
    .join("projects", "migrations.project_id", "projects.id")
    .where("projects.user_id", req.params.id)
    .select(
      "migrations.*",
      "projects.name as project_name",
      "projects.github_repo_full_name",
    )
    .orderBy("migrations.created_at", "desc");
  res.json(migrations);
});

router.get("/users/:id/billing", async (req: AuthRequest, res: Response) => {
  const events = await db("billing_events")
    .where({ user_id: req.params.id })
    .orderBy("created_at", "desc");
  res.json(events);
});

const resetAnalysesSchema = z.object({
  limit: z.number().int().min(0).max(1000).optional(),
}).strip();

// Reset a user's free analysis usage back to zero (giving them their full free
// allotment again). Optionally also set a new limit.
router.post(
  "/users/:id/reset-analyses",
  validateBody(resetAnalysesSchema),
  async (req: AuthRequest, res: Response) => {
    const user = await db("users").where({ id: req.params.id }).first();
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const updates: Record<string, number | string> = {
      free_analyses_used: 0,
      updated_at: new Date().toISOString(),
    };
    if (typeof req.body.limit === "number") {
      updates.free_analyses_limit = req.body.limit;
    }

    await db("users").where({ id: user.id }).update(updates);

    const updated = await db("users").where({ id: user.id }).first();
    res.json({
      id: updated.id,
      free_analyses_used: updated.free_analyses_used,
      free_analyses_limit: updated.free_analyses_limit,
    });
  },
);

// Permanently delete a user and all of their data. Deleting the users row
// cascades to projects -> migrations -> migration_files and billing_events;
// support tickets keep their row with user_id nulled. We additionally purge the
// user's S3 workspaces (not covered by the DB cascade) and the Supabase auth
// account so they can't sign back in.
router.delete("/users/:id", async (req: AuthRequest, res: Response) => {
  const userId = String(req.params.id);
  if (userId === req.userId) {
    res.status(400).json({ error: "You can't delete your own admin account." });
    return;
  }

  const user = await db("users").where({ id: userId }).first();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const projects = await db("projects").where({ user_id: userId }).select("id");
  for (const p of projects) {
    try {
      await s3.deleteWorkspace(`workspaces/${p.id}`);
    } catch (err) {
      console.error(
        `[admin] failed to delete S3 workspace for project ${p.id}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  await db("users").where({ id: userId }).delete();

  try {
    const { error } = await getSupabaseAdmin().auth.admin.deleteUser(userId);
    if (error) {
      console.error(
        `[admin] Supabase auth deleteUser failed for ${userId}:`,
        error.message,
      );
    }
  } catch (err) {
    console.error(
      `[admin] Supabase auth deleteUser threw for ${userId}:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  res.json({ ok: true, deleted_projects: projects.length });
});

router.get("/migrations/:id", async (req: AuthRequest, res: Response) => {
  const migration = await db("migrations").where({ id: req.params.id }).first();
  if (!migration) {
    res.status(404).json({ error: "Migration not found" });
    return;
  }

  const project = await db("projects").where({ id: migration.project_id }).first();

  const billingEvents = await db("billing_events")
    .where({ migration_id: migration.id })
    .orderBy("created_at", "desc");

  const files = await db("migration_files")
    .where({ migration_id: migration.id })
    .select("id", "file_path", "status", "input_tokens", "output_tokens", "created_at")
    .orderBy("file_path");

  const revenueCents = billingEvents
    .filter((b: Record<string, unknown>) => b.status === "paid")
    .reduce((sum: number, b: Record<string, unknown>) => sum + (Number(b.billed_cost_cents) || 0), 0);

  const analysisCost = rawAnthropicCostCents(
    migration.analysis_input_tokens || 0,
    migration.analysis_output_tokens || 0,
  );
  const migrationCost = rawAnthropicCostCents(
    migration.actual_input_tokens || 0,
    migration.actual_output_tokens || 0,
  );
  const apiCost = analysisCost + migrationCost;

  // What the customer is charged: base fee + billed AI token usage (already
  // included in estimated_cost_cents) + any add-ons. estimated_cost_cents from
  // calculateCost() = token cost (with markup) + base fee.
  const baseFeeCents = parseInt(process.env.BASE_FEE_CENTS || "3500");
  const addonCodeReviewCents = migration.addon_code_review
    ? parseInt(process.env.ADDON_CODE_REVIEW_CENTS || "7500")
    : 0;
  const estimatedCostCents = migration.estimated_cost_cents || 0;
  const tokenBilledCents = Math.max(0, estimatedCostCents - baseFeeCents);
  const customerPriceCents = estimatedCostCents + addonCodeReviewCents;

  res.json({
    ...migration,
    project_name: project?.name || null,
    github_repo_full_name: project?.github_repo_full_name || null,
    analysis_cost_cents: analysisCost,
    migration_cost_cents: migrationCost,
    raw_cost_cents: apiCost,
    revenue_cents: revenueCents,
    margin_cents: revenueCents - apiCost,
    customer_price: {
      base_fee_cents: baseFeeCents,
      token_billed_cents: tokenBilledCents,
      addon_code_review_cents: addonCodeReviewCents,
      total_cents: customerPriceCents,
    },
    billing_events: billingEvents,
    files,
  });
});

// Permanently delete a single migration. Deleting the migrations row cascades to
// migration_files; billing_events.migration_id is set null (the billing record
// is preserved for accounting). We also purge the migration's S3 workspace,
// which includes any reviewed-code artifacts stored under it.
router.delete("/migrations/:id", async (req: AuthRequest, res: Response) => {
  const migrationId = String(req.params.id);
  const migration = await db("migrations").where({ id: migrationId }).first();
  if (!migration) {
    res.status(404).json({ error: "Migration not found" });
    return;
  }

  try {
    await s3.deleteWorkspace(
      s3.getWorkspacePrefix(migration.project_id, migration.id),
    );
  } catch (err) {
    console.error(
      `[admin] failed to delete S3 workspace for migration ${migration.id}:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  await db("migrations").where({ id: migrationId }).delete();

  res.json({ ok: true });
});

// Download the full migrated output as a .zip for code review. The customer's
// output repo is private under their own GitHub account (we can't read it), but
// S3 holds everything we need: the original source tree plus the `migrated/`
// overlay we produced. We reconstruct exactly what the customer received —
// original files with migrated/scaffold files layered on top — and strip any
// committed secret files (we never propagate or disclose those).
router.get("/migrations/:id/download", async (req: AuthRequest, res: Response) => {
  const migration = await db("migrations").where({ id: req.params.id }).first();
  if (!migration) {
    res.status(404).json({ error: "Migration not found" });
    return;
  }
  const project = await db("projects").where({ id: migration.project_id }).first();
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const prefix = s3.getWorkspacePrefix(project.id, migration.id);
  const keys = await s3.listFiles(prefix);
  if (keys.length === 0) {
    res.status(404).json({ error: "No code is stored for this migration" });
    return;
  }

  // outputPath -> relative S3 key. Lay the original tree down first, then let
  // the `migrated/` overlay win for any file the migration changed or added.
  const outputMap = new Map<string, string>();
  for (const rel of keys) {
    if (rel.startsWith("migrated/")) continue;
    outputMap.set(rel, rel);
  }
  for (const rel of keys) {
    if (!rel.startsWith("migrated/")) continue;
    const outPath = rel.slice("migrated/".length);
    if (outPath) outputMap.set(outPath, rel);
  }
  for (const outPath of [...outputMap.keys()]) {
    if (isSecretFile(outPath)) outputMap.delete(outPath);
  }

  if (outputMap.size === 0) {
    res.status(404).json({ error: "No reviewable files found" });
    return;
  }

  const safeName =
    (project.name || "project").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase() ||
    "project";
  const filename = `${safeName}-${String(migration.id).slice(0, 8)}.zip`;

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err: Error) => {
    console.error(`[admin] zip error for migration ${migration.id}:`, err.message);
    res.destroy(err);
  });
  archive.pipe(res);

  for (const [outPath, relKey] of outputMap) {
    try {
      const buf = await s3.downloadBuffer(`${prefix}/${relKey}`);
      archive.append(buf, { name: outPath });
    } catch (err) {
      console.warn(
        `[admin] skipped ${relKey} while zipping migration ${migration.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  await archive.finalize();
});

const reviewStatusSchema = z.object({
  status: z.enum(["reviewing", "reviewed"]),
}).strip();

router.get("/pending-reviews", async (_req: AuthRequest, res: Response) => {
  const reviews = await db("migrations")
    .join("projects", "migrations.project_id", "projects.id")
    .join("users", "projects.user_id", "users.id")
    .whereIn("migrations.status", ["pending_review", "reviewing"])
    .select(
      "migrations.id",
      "migrations.project_id",
      "migrations.status",
      "migrations.detected_platform",
      "migrations.files_to_migrate",
      "migrations.files_migrated",
      "migrations.output_repo_url",
      "migrations.output_branch",
      "migrations.completed_at",
      "projects.name as project_name",
      "users.email as user_email",
    )
    .orderBy("migrations.completed_at", "asc");

  res.json(reviews);
});

router.patch(
  "/migrations/:id/review-status",
  validateBody(reviewStatusSchema),
  async (req: AuthRequest, res: Response) => {
    const { status } = req.body;
    const migration = await db("migrations").where({ id: req.params.id }).first();

    if (!migration) {
      res.status(404).json({ error: "Migration not found" });
      return;
    }

    if (!["pending_review", "reviewing"].includes(migration.status)) {
      res.status(400).json({ error: `Cannot transition from ${migration.status} to ${status}` });
      return;
    }

    await db("migrations").where({ id: migration.id }).update({
      status,
      updated_at: new Date().toISOString(),
    });

    res.json({ id: migration.id, status });
  },
);

const reviewUploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(200),
}).strip();

const ALLOWED_REVIEW_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
]);

// Mint a presigned PUT URL so the reviewer can upload the reviewed code archive
// straight to S3 (no multipart handling on our side). The key is generated
// server-side and scoped to this migration's workspace so it can't be spoofed.
router.post(
  "/migrations/:id/review-upload-url",
  validateBody(reviewUploadUrlSchema),
  async (req: AuthRequest, res: Response) => {
    const { filename, contentType } = req.body;
    if (!ALLOWED_REVIEW_TYPES.has(contentType)) {
      res.status(400).json({ error: "Reviewed code must be uploaded as a .zip" });
      return;
    }

    const migration = await db("migrations").where({ id: req.params.id }).first();
    if (!migration) {
      res.status(404).json({ error: "Migration not found" });
      return;
    }
    const project = await db("projects").where({ id: migration.project_id }).first();
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const prefix = s3.getWorkspacePrefix(project.id, migration.id);
    const key = `${prefix}/reviewed/${crypto.randomUUID()}.zip`;
    const { uploadUrl } = await getPresignedUploadUrl(key, contentType);
    res.json({ uploadUrl, key });
  },
);

const deliverReviewSchema = z.object({
  notes: z.string().max(20000).optional(),
  artifact_key: z.string().max(512).optional(),
  artifact_name: z.string().max(255).optional(),
}).strip();

// Deliver the review to the customer: save the notes and (optionally) the
// uploaded reviewed-code archive, then flip the migration to "reviewed".
router.patch(
  "/migrations/:id/review",
  validateBody(deliverReviewSchema),
  async (req: AuthRequest, res: Response) => {
    const { notes, artifact_key, artifact_name } = req.body;
    const migration = await db("migrations").where({ id: req.params.id }).first();
    if (!migration) {
      res.status(404).json({ error: "Migration not found" });
      return;
    }
    if (!["pending_review", "reviewing", "reviewed"].includes(migration.status)) {
      res.status(400).json({
        error: `Cannot deliver a review for a migration in "${migration.status}" state`,
      });
      return;
    }

    const updates: Record<string, unknown> = {
      status: "reviewed",
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (notes !== undefined) updates.review_notes = notes;

    if (artifact_key !== undefined) {
      const project = await db("projects").where({ id: migration.project_id }).first();
      const prefix = project
        ? s3.getWorkspacePrefix(project.id, migration.id)
        : "";
      // Only accept a key we minted for this migration's workspace.
      if (!prefix || !artifact_key.startsWith(`${prefix}/reviewed/`)) {
        res.status(400).json({ error: "Invalid artifact key" });
        return;
      }
      updates.review_artifact_key = artifact_key;
      updates.review_artifact_name = artifact_name || "reviewed-code.zip";
    }

    await db("migrations").where({ id: migration.id }).update(updates);

    // Notify the customer (best-effort; never block the response on email).
    try {
      const project = await db("projects").where({ id: migration.project_id }).first();
      const user = project
        ? await db("users").where({ id: project.user_id }).first()
        : null;
      if (user?.email) {
        await sendReviewDelivered({
          to: user.email,
          projectName: project?.name || "your project",
          migrationId: migration.id,
          hasNotes: !!(updates.review_notes ?? migration.review_notes),
          hasCode: !!(updates.review_artifact_key ?? migration.review_artifact_key),
        });
      }
    } catch (err) {
      console.error("[admin] review-delivered email failed:", err);
    }

    res.json({ id: migration.id, status: "reviewed" });
  },
);

router.get("/tickets", validateQuery(ticketsQuerySchema), async (req: AuthRequest, res: Response) => {
  const { status, type, page = "1", limit = "50" } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let query = db("support_tickets");
  if (status) query = query.where({ status });
  if (type) query = query.where({ type });

  const [total] = await query.clone().count("id as count");
  const tickets = await query.orderBy("created_at", "desc").limit(Number(limit)).offset(offset);

  // Attachments are private S3 keys; mint short-lived signed URLs for viewing.
  const withSignedImages = await Promise.all(
    tickets.map(async (t: { image_urls?: unknown }) => {
      const keys: string[] = Array.isArray(t.image_urls)
        ? (t.image_urls as string[])
        : typeof t.image_urls === "string"
          ? JSON.parse(t.image_urls || "[]")
          : [];
      const image_urls = await Promise.all(
        keys.map(async (k) => {
          // Back-compat: if a legacy full URL slipped in, pass it through.
          if (k.startsWith("http://") || k.startsWith("https://")) return k;
          try {
            return await getPresignedDownloadUrl(k, 900);
          } catch {
            return "";
          }
        }),
      );
      return { ...t, image_urls: image_urls.filter(Boolean) };
    }),
  );

  res.json({ tickets: withSignedImages, total: Number(total.count), page: Number(page), limit: Number(limit) });
});

router.patch("/tickets/:id", validateBody(updateTicketSchema), async (req: AuthRequest, res: Response) => {
  const { status, admin_notes } = req.body;

  const updates: Record<string, string> = { updated_at: new Date().toISOString() };
  if (status) updates.status = status;
  if (admin_notes !== undefined) updates.admin_notes = admin_notes;

  await db("support_tickets").where({ id: req.params.id }).update(updates);
  const ticket = await db("support_tickets").where({ id: req.params.id }).first();

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  res.json(ticket);
});

export default router;
