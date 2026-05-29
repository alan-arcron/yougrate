import { Router, Response } from "express";
import { db } from "../db";
import type { AuthRequest } from "../middleware/auth";
import { requireAuth, isAdmin } from "../middleware/auth";
import { getUserBillingSummary, createAnalysisUnlockCheckout, verifyCheckoutPaid, createBillingPortalSession } from "../services/billing";

const router = Router();

router.get("/summary", requireAuth, async (req: AuthRequest, res: Response) => {
  const summary = await getUserBillingSummary(req.userId!);
  res.json(summary);
});

router.get("/analysis-quota", requireAuth, async (req: AuthRequest, res: Response) => {
  if (isAdmin(req.userEmail)) {
    res.json({ used: 0, limit: Infinity, remaining: Infinity, needs_payment: false });
    return;
  }
  const user = await db("users").where({ id: req.userId }).first();
  const used = user.free_analyses_used || 0;
  const limit = user.free_analyses_limit || 2;
  res.json({
    used,
    limit,
    remaining: Math.max(0, limit - used),
    needs_payment: used >= limit,
  });
});

router.post("/unlock-analyses", requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await db("users").where({ id: req.userId }).first();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const used = user.free_analyses_used || 0;
  const limit = user.free_analyses_limit || 2;
  if (used < limit) {
    res.status(400).json({ error: "You still have free analyses remaining" });
    return;
  }

  // Sum up analysis tokens used across all their migrations
  const tokenResult = await db("migrations")
    .join("projects", "migrations.project_id", "projects.id")
    .where("projects.user_id", req.userId)
    .sum("migrations.analysis_input_tokens as total_input")
    .sum("migrations.analysis_output_tokens as total_output")
    .first();

  const totalTokens = (tokenResult?.total_input || 0) + (tokenResult?.total_output || 0);

  const { checkoutUrl } = await createAnalysisUnlockCheckout(
    req.userId!,
    user.email,
    totalTokens,
  );

  res.json({ checkout_url: checkoutUrl });
});

router.post("/verify-unlock", requireAuth, async (req: AuthRequest, res: Response) => {
  const billingEvent = await db("billing_events")
    .where({ user_id: req.userId })
    .whereNull("migration_id")
    .orderBy("created_at", "desc")
    .first();

  if (!billingEvent?.stripe_invoice_id) {
    res.json({ unlocked: false });
    return;
  }

  const paid = await verifyCheckoutPaid(billingEvent.stripe_invoice_id);
  if (paid && billingEvent.status !== "paid") {
    await db("billing_events").where({ id: billingEvent.id }).update({ status: "paid" });
    await db("users").where({ id: req.userId }).increment("free_analyses_limit", 2);
  }

  res.json({ unlocked: paid });
});

router.post("/portal", requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await db("users").where({ id: req.userId }).first();
  if (!user?.stripe_customer_id) {
    res.status(400).json({ error: "No billing history found" });
    return;
  }

  const { url } = await createBillingPortalSession(user.stripe_customer_id);
  res.json({ portal_url: url });
});

export default router;
