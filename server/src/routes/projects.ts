import { Router, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import type { AuthRequest } from "../middleware/auth";
import { requireAuth, isAdmin } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as githubService from "../services/github";
import * as s3 from "../services/s3";
import { validateSupabaseConnectionString } from "../services/schema-apply";
import { decryptSecret, encryptSecret } from "../utils/crypto";

const createProjectSchema = z.object({
  name: z.string().max(200).optional(),
  github_repo_url: z.string().url().max(2000).optional(),
  github_repo_full_name: z.string().min(1).max(200).regex(/^[^/]+\/[^/]+$/, "Must be in owner/repo format"),
  default_branch: z.string().max(100).optional(),
}).strip();

const updateSupabaseSchema = z.object({
  supabase_url: z.string().url().max(500).nullish(),
  supabase_anon_key: z.string().max(500).nullish(),
  connection_string: z.string().max(1000).nullish(),
}).strip();

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const projects = await db("projects")
    .where({ user_id: req.userId })
    .orderBy("created_at", "desc");
  res.json(projects);
});

router.post("/", requireAuth, validateBody(createProjectSchema), async (req: AuthRequest, res: Response) => {
  const { name, github_repo_full_name, default_branch } = req.body;

  const user = await db("users").where({ id: req.userId }).first();
  if (!user?.github_access_token) {
    res.status(400).json({ error: "GitHub not connected" });
    return;
  }

  // Verify the requesting user's own token can actually access this repo.
  // This blocks pointing a project at an arbitrary repo the user can't see.
  let repoInfo;
  try {
    repoInfo = await githubService.getRepoInfo(
      decryptSecret(user.github_access_token),
      github_repo_full_name,
    );
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 401) {
      res.status(401).json({
        error: "github_token_expired",
        message: "Your GitHub token has expired. Please reconnect GitHub in Settings.",
      });
      return;
    }
    throw err;
  }

  if (!repoInfo) {
    res.status(403).json({
      error: "repo_not_accessible",
      message:
        "That repository was not found or your GitHub account does not have access to it.",
    });
    return;
  }

  // Always derive the canonical URL/branch from GitHub, ignoring client-supplied
  // values that could be inconsistent with the verified repo.
  const [project] = await db("projects")
    .insert({
      user_id: req.userId,
      name: name || repoInfo.full_name.split("/")[1],
      github_repo_url: `https://github.com/${repoInfo.full_name}`,
      github_repo_full_name: repoInfo.full_name,
      default_branch: default_branch || repoInfo.default_branch || "main",
    })
    .returning("*");

  res.status(201).json(project);
});

router.get("/github/repos", requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await db("users").where({ id: req.userId }).first();
  if (!user?.github_access_token) {
    res.status(400).json({ error: "GitHub not connected" });
    return;
  }

  try {
    const repos = await githubService.listRepos(decryptSecret(user.github_access_token));
    res.json(repos);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) {
      res.status(401).json({
        error: "github_token_expired",
        message: "Your GitHub token has expired. Please reconnect GitHub in Settings.",
      });
      return;
    }
    throw err;
  }
});

router.get("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  const project = await db("projects")
    .where({ id: req.params.id, user_id: req.userId })
    .first();

  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const migrations = await db("migrations")
    .where({ project_id: project.id })
    .orderBy("created_at", "desc");

  // Never expose the (encrypted) DB connection string to the client.
  const { supabase_db_url, ...safeProject } = project;
  void supabase_db_url;
  res.json({ ...safeProject, migrations });
});

router.patch("/:id/supabase", requireAuth, validateBody(updateSupabaseSchema), async (req: AuthRequest, res: Response) => {
  const { supabase_url, supabase_anon_key, connection_string } = req.body;

  const updates: Record<string, unknown> = {
    supabase_url,
    supabase_anon_key,
    updated_at: new Date().toISOString(),
  };

  // Connection string is optional. Validate + encrypt before storing; ignore
  // empty strings so we don't clobber a previously saved value.
  const conn = connection_string?.trim();
  if (conn) {
    const valid = validateSupabaseConnectionString(conn);
    if (!valid.ok) {
      res.status(400).json({ error: valid.error });
      return;
    }
    updates.supabase_db_url = encryptSecret(conn);
  }

  const [project] = await db("projects")
    .where({ id: req.params.id, user_id: req.userId })
    .update(updates)
    .returning("*");

  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const { supabase_db_url, ...safeProject } = project;
  void supabase_db_url;
  res.json(safeProject);
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  // Project deletion is an admin-only operation. Admins may delete any project.
  if (!isAdmin(req.userEmail)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const project = await db("projects").where({ id: req.params.id }).first();
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Best-effort cleanup of S3 workspaces for this project's migrations.
  try {
    await s3.deleteWorkspace(`workspaces/${project.id}`);
  } catch (err) {
    console.error(
      `[projects] Failed to clean S3 for project ${project.id.slice(0, 8)}:`,
      err,
    );
  }

  // DB cascade removes migrations + migration_files; billing_events are
  // preserved (migration_id is set null) so revenue records stay intact.
  await db("projects").where({ id: project.id }).del();

  res.json({ deleted: true });
});

export default router;
