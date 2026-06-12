import { Router, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import type { AuthRequest } from "../middleware/auth";
import { requireAuth, isAdmin } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { encryptSecret, decryptSecret } from "../utils/crypto";
import * as vercelService from "../services/vercel";
import * as railwayService from "../services/railway";

const syncSchema = z.object({
  name: z.string().max(200).nullish(),
  avatar_url: z.string().url().max(2000).nullish(),
  github_access_token: z.string().max(500).nullish(),
  github_username: z.string().max(100).nullish(),
}).strip();

const githubTokenSchema = z.object({
  access_token: z.string().min(1, "access_token is required").max(500),
  username: z.string().max(100).nullish(),
}).strip();

const vercelTokenSchema = z.object({
  access_token: z.string().min(1, "access_token is required").max(500),
}).strip();

const railwayTokenSchema = z.object({
  access_token: z.string().min(1, "access_token is required").max(500),
}).strip();

const router = Router();

router.post("/sync", requireAuth, validateBody(syncSchema), async (req: AuthRequest, res: Response) => {
  const { name, avatar_url, github_access_token, github_username } = req.body;
  const email = req.userEmail;

  const existing = await db("users").where({ id: req.userId }).first();

  if (existing) {
    const updates: Record<string, string> = {
      email: email || existing.email,
      name: name || existing.name,
      avatar_url: avatar_url || existing.avatar_url,
      updated_at: new Date().toISOString(),
    };
    if (github_access_token && !existing.github_access_token) {
      updates.github_access_token = encryptSecret(github_access_token)!;
      updates.github_username = github_username || existing.github_username;
    }
    await db("users").where({ id: req.userId }).update(updates);
  } else {
    await db("users").insert({
      id: req.userId,
      email,
      name,
      avatar_url,
      github_access_token: encryptSecret(github_access_token) || null,
      github_username: github_username || null,
    });
  }

  const user = await db("users").where({ id: req.userId }).first();
  res.json({
    ...user,
    github_connected: !!user?.github_access_token,
    vercel_connected: !!user?.vercel_access_token,
    railway_connected: !!user?.railway_access_token,
    is_admin: isAdmin(user?.email),
    github_access_token: undefined,
    vercel_access_token: undefined,
    railway_access_token: undefined,
  });
});

router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await db("users").where({ id: req.userId }).first();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    ...user,
    github_connected: !!user.github_access_token,
    vercel_connected: !!user.vercel_access_token,
    railway_connected: !!user.railway_access_token,
    is_admin: isAdmin(user.email),
    github_access_token: undefined,
    vercel_access_token: undefined,
    railway_access_token: undefined,
  });
});

router.post("/github-token", requireAuth, validateBody(githubTokenSchema), async (req: AuthRequest, res: Response) => {
  const { access_token, username } = req.body;

  await db("users").where({ id: req.userId }).update({
    github_access_token: encryptSecret(access_token),
    github_username: username,
    updated_at: new Date().toISOString(),
  });

  res.json({ connected: true });
});

router.post("/vercel-token", requireAuth, validateBody(vercelTokenSchema), async (req: AuthRequest, res: Response) => {
  const { access_token } = req.body;

  await db("users").where({ id: req.userId }).update({
    vercel_access_token: encryptSecret(access_token),
    updated_at: new Date().toISOString(),
  });

  res.json({ connected: true });
});

router.get("/vercel-status", requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await db("users").where({ id: req.userId }).first();
  if (!user?.vercel_access_token) {
    res.json({ connected: false, status: "disconnected" });
    return;
  }
  const status = await vercelService.verifyToken(
    decryptSecret(user.vercel_access_token),
  );
  res.json({ connected: true, status });
});

router.post("/railway-token", requireAuth, validateBody(railwayTokenSchema), async (req: AuthRequest, res: Response) => {
  const { access_token } = req.body;

  await db("users").where({ id: req.userId }).update({
    railway_access_token: encryptSecret(access_token),
    updated_at: new Date().toISOString(),
  });

  res.json({ connected: true });
});

router.get("/railway-status", requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await db("users").where({ id: req.userId }).first();
  if (!user?.railway_access_token) {
    res.json({ connected: false, status: "disconnected" });
    return;
  }
  const status = await railwayService.verifyToken(
    decryptSecret(user.railway_access_token),
  );
  res.json({ connected: true, status });
});

export default router;
