import { Router, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import type { AuthRequest } from "../middleware/auth";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { validateBody, validateQuery } from "../middleware/validate";

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

  const [anthropicCost] = await db("migrations")
    .whereNotNull("actual_cost_cents")
    .sum("actual_cost_cents as total");
  const [anthropicTokens] = await db("migrations")
    .select(
      db.raw("COALESCE(SUM(actual_input_tokens), 0) as total_input"),
      db.raw("COALESCE(SUM(actual_output_tokens), 0) as total_output"),
      db.raw("COALESCE(SUM(analysis_input_tokens), 0) as analysis_input"),
      db.raw("COALESCE(SUM(analysis_output_tokens), 0) as analysis_output"),
    )
    .first();

  const totalRevenueCents = Number(revenue.total) || 0;
  const totalAnthropicCostCents = Number(anthropicCost.total) || 0;

  res.json({
    total_users: Number(userCount.count),
    total_migrations: Number(migrationCount.count),
    open_tickets: Number(ticketCount.count),
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
      "migrations.status",
      "migrations.detected_platform",
      "migrations.files_to_migrate",
      "migrations.files_migrated",
      "migrations.actual_input_tokens",
      "migrations.actual_output_tokens",
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
    .where({ status: "paid" })
    .select("migration_id")
    .sum("billed_cost_cents as revenue_cents")
    .groupBy("migration_id");

  const revenueMap = new Map(
    billingByMigration.map((b: Record<string, unknown>) => [String(b.migration_id), Number(b.revenue_cents)]),
  );

  const rows = migrations.map((m: Record<string, unknown>) => ({
    ...m,
    revenue_cents: revenueMap.get(m.id as string) || 0,
    margin_cents: (revenueMap.get(m.id as string) || 0) - (Number(m.actual_cost_cents) || 0),
  }));

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

  res.json({
    ...migration,
    project_name: project?.name || null,
    github_repo_full_name: project?.github_repo_full_name || null,
    revenue_cents: revenueCents,
    margin_cents: revenueCents - (migration.actual_cost_cents || 0),
    billing_events: billingEvents,
    files,
  });
});

router.get("/tickets", validateQuery(ticketsQuerySchema), async (req: AuthRequest, res: Response) => {
  const { status, type, page = "1", limit = "50" } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let query = db("support_tickets");
  if (status) query = query.where({ status });
  if (type) query = query.where({ type });

  const [total] = await query.clone().count("id as count");
  const tickets = await query.orderBy("created_at", "desc").limit(Number(limit)).offset(offset);

  res.json({ tickets, total: Number(total.count), page: Number(page), limit: Number(limit) });
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
