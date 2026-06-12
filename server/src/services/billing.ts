import Stripe from "stripe";
import { db } from "../db";

let stripe: InstanceType<typeof Stripe> | null = null;

function getStripe(): InstanceType<typeof Stripe> {
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
  }
  return stripe;
}

export function getRawStripe(): InstanceType<typeof Stripe> {
  return getStripe();
}

export async function getOrCreateCustomer(
  userId: string,
  email: string,
): Promise<string> {
  const s = getStripe();
  const user = await db("users").where({ id: userId }).first();

  if (user?.stripe_customer_id) {
    try {
      await s.customers.retrieve(user.stripe_customer_id);
      return user.stripe_customer_id;
    } catch {
      console.warn(`[billing] Stale Stripe customer ${user.stripe_customer_id} for user ${userId.slice(0, 8)}, creating new one`);
    }
  }

  const customer = await s.customers.create({
    email,
    metadata: { userId },
  });

  await db("users")
    .where({ id: userId })
    .update({ stripe_customer_id: customer.id });
  return customer.id;
}

export interface CheckoutAddons {
  codeReview?: boolean;
}

const ADDON_CODE_REVIEW_CENTS = parseInt(
  process.env.ADDON_CODE_REVIEW_CENTS || "7500",
); // $75

export function addonTotalCents(addons?: CheckoutAddons): number {
  let total = 0;
  if (addons?.codeReview) total += ADDON_CODE_REVIEW_CENTS;
  return total;
}

export async function createCheckoutForMigration(
  userId: string,
  email: string,
  migrationId: string,
  estimatedCostCents: number,
  estimatedTokens: number,
  addons?: CheckoutAddons,
): Promise<{ checkoutUrl: string; sessionId: string }> {
  const s = getStripe();
  const customerId = await getOrCreateCustomer(userId, email);

  const baseFeeCents = parseInt(process.env.BASE_FEE_CENTS || "3500");
  const tokenCostCents = Math.max(0, estimatedCostCents - baseFeeCents);

  //@ts-ignore
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      price_data: {
        currency: "usd",
        product_data: {
          name: "Migration base fee",
          description:
            "Code migration to Supabase + generated database schema (tables, RLS, indexes)",
        },
        unit_amount: baseFeeCents,
      },
      quantity: 1,
    },
  ];

  if (tokenCostCents > 0) {
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: {
          name: `AI token usage (~${estimatedTokens.toLocaleString()} tokens)`,
        },
        unit_amount: tokenCostCents,
      },
      quantity: 1,
    });
  }

  if (addons?.codeReview) {
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: {
          name: "Senior engineer code review",
          description:
            "A human senior engineer reviews your migrated code before delivery",
        },
        unit_amount: ADDON_CODE_REVIEW_CENTS,
      },
      quantity: 1,
    });
  }

  const totalBilledCents = estimatedCostCents + addonTotalCents(addons);

  const clientUrl = process.env.CLIENT_URL || "http://localhost:5175";

  const migration = await db("migrations").where({ id: migrationId }).first();
  const projectId = migration?.project_id || "";

  const session = await s.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: lineItems,
    allow_promotion_codes: true,
    metadata: { migrationId, userId },
    payment_intent_data: { receipt_email: email },
    success_url: `${clientUrl}/project/${projectId}/migration/${migrationId}?paid=true`,
    cancel_url: `${clientUrl}/project/${projectId}/migration/${migrationId}?cancelled=true`,
  });

  await db("billing_events").insert({
    user_id: userId,
    migration_id: migrationId,
    input_tokens: 0,
    output_tokens: 0,
    raw_cost_cents: 0,
    billed_cost_cents: totalBilledCents,
    markup_multiplier: parseFloat(process.env.TOKEN_MARKUP_MULTIPLIER || "4"),
    stripe_invoice_id: session.id,
    status: "pending",
  });

  return { checkoutUrl: session.url!, sessionId: session.id };
}

export async function createAnalysisUnlockCheckout(
  userId: string,
  email: string,
  analysisTokensUsed: number,
): Promise<{ checkoutUrl: string; sessionId: string }> {
  const s = getStripe();
  const customerId = await getOrCreateCustomer(userId, email);

  const ANALYSIS_UNLOCK_CENTS = 1000; // $10 to unlock 2 more analyses (covers cost of previous 2)
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5175";

  const session = await s.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "Analysis unlock (2 analyses)",
            description: `Covers ${analysisTokensUsed.toLocaleString()} tokens used + unlocks 2 more analyses`,
          },
          unit_amount: ANALYSIS_UNLOCK_CENTS,
        },
        quantity: 1,
      },
    ],
    metadata: { userId, type: "analysis_unlock" },
    payment_intent_data: { receipt_email: email },
    success_url: `${clientUrl}/dashboard?unlocked=true`,
    cancel_url: `${clientUrl}/dashboard?unlock_cancelled=true`,
  });

  await db("billing_events").insert({
    user_id: userId,
    input_tokens: analysisTokensUsed,
    output_tokens: 0,
    raw_cost_cents: 0,
    billed_cost_cents: ANALYSIS_UNLOCK_CENTS,
    markup_multiplier: 1,
    stripe_invoice_id: session.id,
    status: "pending",
  });

  return { checkoutUrl: session.url!, sessionId: session.id };
}

export async function createCheckoutForOverage(
  userId: string,
  email: string,
  migrationId: string,
  overageCents: number,
  projectedRemainingTokens: number,
): Promise<{ checkoutUrl: string; sessionId: string }> {
  const s = getStripe();
  const customerId = await getOrCreateCustomer(userId, email);
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5175";

  const migration = await db("migrations").where({ id: migrationId }).first();
  const projectId = migration?.project_id || "";

  const session = await s.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "Additional migration token usage",
            description: `Covers ~${projectedRemainingTokens.toLocaleString()} additional tokens for remaining files`,
          },
          unit_amount: overageCents,
        },
        quantity: 1,
      },
    ],
    metadata: { migrationId, userId, type: "migration_overage" },
    payment_intent_data: { receipt_email: email },
    success_url: `${clientUrl}/project/${projectId}/migration/${migrationId}?overage_paid=true`,
    cancel_url: `${clientUrl}/project/${projectId}/migration/${migrationId}?overage_cancelled=true`,
  });

  await db("billing_events").insert({
    user_id: userId,
    migration_id: migrationId,
    input_tokens: 0,
    output_tokens: 0,
    raw_cost_cents: 0,
    billed_cost_cents: overageCents,
    markup_multiplier: parseFloat(process.env.TOKEN_MARKUP_MULTIPLIER || "4"),
    stripe_invoice_id: session.id,
    status: "pending",
  });

  return { checkoutUrl: session.url!, sessionId: session.id };
}

export async function createCheckoutForReview(
  userId: string,
  email: string,
  migrationId: string,
): Promise<{ checkoutUrl: string; sessionId: string }> {
  const s = getStripe();
  const customerId = await getOrCreateCustomer(userId, email);
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5175";

  const migration = await db("migrations").where({ id: migrationId }).first();
  const projectId = migration?.project_id || "";

  const session = await s.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "Senior engineer code review",
            description:
              "A human senior engineer reviews your migrated code before delivery",
          },
          unit_amount: ADDON_CODE_REVIEW_CENTS,
        },
        quantity: 1,
      },
    ],
    allow_promotion_codes: true,
    metadata: { migrationId, userId, type: "code_review" },
    payment_intent_data: { receipt_email: email },
    success_url: `${clientUrl}/project/${projectId}/migration/${migrationId}?review_paid=true`,
    cancel_url: `${clientUrl}/project/${projectId}/migration/${migrationId}?review_cancelled=true`,
  });

  await db("billing_events").insert({
    user_id: userId,
    migration_id: migrationId,
    input_tokens: 0,
    output_tokens: 0,
    raw_cost_cents: 0,
    billed_cost_cents: ADDON_CODE_REVIEW_CENTS,
    markup_multiplier: 1,
    stripe_invoice_id: session.id,
    status: "pending",
  });

  return { checkoutUrl: session.url!, sessionId: session.id };
}

export async function createBillingPortalSession(
  customerId: string,
): Promise<{ url: string }> {
  const s = getStripe();
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5175";
  const session = await s.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${clientUrl}/settings`,
  });
  return { url: session.url };
}

export async function verifyCheckoutPaid(sessionId: string): Promise<boolean> {
  const s = getStripe();
  const session = await s.checkout.sessions.retrieve(sessionId);
  return session.payment_status === "paid";
}

export async function handleCheckoutCompleted(
  //@ts-ignore
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  const type = session.metadata?.type;

  await db("billing_events")
    .where({ stripe_invoice_id: session.id })
    .update({ status: "paid" });

  if (type === "analysis_unlock") {
    const userId = session.metadata?.userId;
    if (userId) {
      await db("users")
        .where({ id: userId })
        .increment("free_analyses_limit", 2);
    }
    return null;
  }

  return session.metadata?.migrationId || null;
}

export async function getUserBillingSummary(userId: string) {
  const events = await db("billing_events")
    .where({ user_id: userId })
    .orderBy("created_at", "desc");

  const totalBilled = events.reduce(
    (sum: number, e: { billed_cost_cents: number }) =>
      sum + e.billed_cost_cents,
    0,
  );
  const totalTokens = events.reduce(
    (sum: number, e: { input_tokens: number; output_tokens: number }) =>
      sum + e.input_tokens + e.output_tokens,
    0,
  );

  return {
    events,
    total_billed_cents: totalBilled,
    total_tokens: totalTokens,
    total_migrations: events.length,
  };
}
