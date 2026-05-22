import { Router, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import type { AuthRequest } from "../middleware/auth";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as githubService from "../services/github";

const createProjectSchema = z.object({
  name: z.string().max(200).optional(),
  github_repo_url: z.string().url().max(2000).optional(),
  github_repo_full_name: z.string().min(1).max(200).regex(/^[^/]+\/[^/]+$/, "Must be in owner/repo format"),
  default_branch: z.string().max(100).optional(),
}).strip();

const updateSupabaseSchema = z.object({
  supabase_url: z.string().url().max(500).nullish(),
  supabase_anon_key: z.string().max(500).nullish(),
}).strip();

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const projects = await db("projects")
    .where({ user_id: req.userId })
    .orderBy("created_at", "desc");
  res.json(projects);
});

router.post("/", requireAuth, validateBody(createProjectSchema), async (req: AuthRequest, res: Response) => {
  const { name, github_repo_url, github_repo_full_name, default_branch } = req.body;

  const [project] = await db("projects")
    .insert({
      user_id: req.userId,
      name: name || github_repo_full_name.split("/")[1],
      github_repo_url: github_repo_url || `https://github.com/${github_repo_full_name}`,
      github_repo_full_name,
      default_branch: default_branch || "main",
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

  const repos = await githubService.listRepos(user.github_access_token);
  res.json(repos);
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

  res.json({ ...project, migrations });
});

router.patch("/:id/supabase", requireAuth, validateBody(updateSupabaseSchema), async (req: AuthRequest, res: Response) => {
  const { supabase_url, supabase_anon_key } = req.body;

  const [project] = await db("projects")
    .where({ id: req.params.id, user_id: req.userId })
    .update({
      supabase_url,
      supabase_anon_key,
      updated_at: new Date().toISOString(),
    })
    .returning("*");

  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(project);
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  const deleted = await db("projects")
    .where({ id: req.params.id, user_id: req.userId })
    .del();

  if (!deleted) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({ deleted: true });
});

export default router;
