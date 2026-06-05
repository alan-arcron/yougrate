import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import { initDb } from "./db";
import { db } from "./db";
import authRouter from "./routes/auth";
import projectsRouter from "./routes/projects";
import migrationsRouter from "./routes/migrations";
import billingRouter from "./routes/billing";
import supportRouter from "./routes/support";
import adminRouter from "./routes/admin";
import { getRawStripe, handleCheckoutCompleted } from "./services/billing";
import { runMigration } from "./services/migrator";
import { startStallDetector } from "./services/stall-detector";
import { requestLogger } from "./middleware/logger";
import { redactError } from "./utils/redact";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const app = express();
const PORT = process.env.PORT || 3001;

app.set("trust proxy", 1);
app.use(helmet());
const ALLOWED_ORIGINS = (process.env.CLIENT_URL || "http://localhost:5175")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  }),
);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many global requests, please try again later" },
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many strict requests, please try again later" },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many auth requests, please try again later" },
});

// Stripe webhook needs raw body — must be before express.json()
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    const secret = process.env.STRIPE_WEBHOOK_SECRET || "";

    try {
      const event = getRawStripe().webhooks.constructEvent(
        req.body,
        sig,
        secret,
      );

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const type = session.metadata?.type;
        const migrationId = await handleCheckoutCompleted(session);

        if (type === "migration_overage" && migrationId) {
          const migration = await db("migrations")
            .where({ id: migrationId })
            .first();
          if (migration?.status === "budget_exceeded") {
            const filesCompleted = migration.files_migrated || 0;
            const filesRemaining =
              (migration.files_to_migrate || 0) - filesCompleted;
            const tokensUsed =
              (migration.actual_input_tokens || 0) +
              (migration.actual_output_tokens || 0);
            const tokensPerFile =
              filesCompleted > 0 ? tokensUsed / filesCompleted : 0;
            const projectedRemaining = Math.ceil(
              tokensPerFile * filesRemaining * 1.1,
            );
            const inputRatio =
              tokensUsed > 0
                ? (migration.actual_input_tokens || 0) / tokensUsed
                : 0.5;
            const newEstInput =
              (migration.actual_input_tokens || 0) +
              Math.ceil(projectedRemaining * inputRatio);
            const newEstOutput =
              (migration.actual_output_tokens || 0) +
              (projectedRemaining - Math.ceil(projectedRemaining * inputRatio));

            const billingEvent = await db("billing_events")
              .where({ stripe_invoice_id: session.id })
              .first();

            const updated = await db("migrations")
              .where({ id: migrationId, status: "budget_exceeded" })
              .update({
                status: "confirmed",
                estimated_input_tokens: newEstInput,
                estimated_output_tokens: newEstOutput,
                estimated_cost_cents:
                  (migration.estimated_cost_cents || 0) +
                  (billingEvent?.billed_cost_cents || 0),
                error_message: null,
              });

            if (updated > 0) {
              runMigration(migrationId).catch((err) => {
                console.error("[migration] Overage migration error:", err);
              });
              console.log(
                `[webhook] Overage paid, resuming migration ${migrationId.slice(0, 8)}`,
              );
            }
          }
        } else if (migrationId) {
          const updated = await db("migrations")
            .where({ id: migrationId, status: "estimated" })
            .update({ status: "confirmed" });

          if (updated > 0) {
            runMigration(migrationId).catch((err) => {
              console.error("[migration] Migration error:", err);
            });
            console.log(
              `[webhook] Payment received, starting migration ${migrationId.slice(0, 8)}`,
            );
          } else {
            console.log(
              `[webhook] Migration ${migrationId.slice(0, 8)} already confirmed, skipping duplicate`,
            );
          }
        }
      } else if (event.type === "checkout.session.expired") {
        const session = event.data.object;
        await db("billing_events")
          .where({ stripe_invoice_id: session.id, status: "pending" })
          .update({ status: "failed" });
        console.log(`[webhook] Checkout expired: ${session.id}`);
      } else if (event.type === "charge.refunded") {
        const charge = event.data.object;
        const paymentIntentId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;
        if (paymentIntentId) {
          const sessions = await getRawStripe().checkout.sessions.list({
            payment_intent: paymentIntentId,
            limit: 1,
          });
          const session = sessions.data[0];
          if (session) {
            await db("billing_events")
              .where({ stripe_invoice_id: session.id })
              .update({ status: "refunded" });
            console.log(`[webhook] Charge refunded for session ${session.id}`);
          }
        }
      } else if (event.type === "charge.dispute.created") {
        const dispute = event.data.object;
        const chargeId =
          typeof dispute.charge === "string"
            ? dispute.charge
            : dispute.charge?.id;
        console.error(
          `[webhook] DISPUTE created on charge ${chargeId}. Amount: ${dispute.amount}. Reason: ${dispute.reason}`,
        );
      }

      res.json({ received: true });
    } catch (err) {
      console.error("[webhook] Error:", err);
      res.status(400).send("Webhook error");
    }
  },
);

app.use(express.json({ limit: "5mb" }));
app.use(requestLogger);

app.use("/api/auth", authLimiter, authRouter);
app.use("/api/projects", globalLimiter, projectsRouter);
app.use("/api/migrations", globalLimiter, migrationsRouter);
app.use("/api/billing", strictLimiter, billingRouter);
app.use("/api/support", strictLimiter, supportRouter);
app.use("/api/admin", globalLimiter, adminRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Global error handler — never leak stack traces to clients
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[server] Unhandled error:", redactError(err));
  res.status(500).json({ error: "Internal server error" });
});

async function boot() {
  await initDb();
  startStallDetector();
  console.log(`[yougrate] Server listening on :${PORT}`);
}

app.listen(PORT, () => {
  boot().catch((err) => {
    console.error("[yougrate] Boot failed:", err);
    process.exit(1);
  });
});
