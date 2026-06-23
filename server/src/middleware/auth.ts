import { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const REVIEWER_EMAILS = (process.env.REVIEWER_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export function isAdmin(email?: string): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Reviewers can access the limited review workflow. Admins are a superset, so
 * they're reviewers too.
 */
export function isReviewer(email?: string): boolean {
  if (!email) return false;
  return isAdmin(email) || REVIEWER_EMAILS.includes(email.toLowerCase());
}

export async function requireReviewer(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  if (!req.userEmail || !isReviewer(req.userEmail)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

/**
 * Maintenance mode. When UNDER_CONSTRUCTION is truthy we lock the dashboard for
 * everyone except admins (so the operator can still log in and test) while the
 * public marketing site stays up. Read at call time so toggling the env var +
 * restart takes effect without a rebuild.
 */
export function isUnderConstruction(): boolean {
  const v = (process.env.UNDER_CONSTRUCTION || "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ error: "No authorization token" });
    return;
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      console.warn(`[auth] Invalid token: ${error?.message || "no user"}`);
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    req.userId = data.user.id;
    req.userEmail = data.user.email;

    // Maintenance mode: block everyone but admins from the authenticated API.
    if (isUnderConstruction() && !isAdmin(req.userEmail)) {
      res.status(503).json({
        error:
          "Yougrate is undergoing maintenance right now. Please check back soon.",
        under_construction: true,
      });
      return;
    }

    next();
  } catch (err) {
    console.warn(`[auth] Auth failed: ${err instanceof Error ? err.message : String(err)}`);
    res.status(401).json({ error: "Auth failed" });
  }
}

export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    next();
    return;
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) {
      req.userId = data.user.id;
      req.userEmail = data.user.email;
    }
  } catch { /* proceed unauthenticated */ }
  next();
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.userEmail || !isAdmin(req.userEmail)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}
