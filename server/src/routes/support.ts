import { Router, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "../db";
import type { AuthRequest } from "../middleware/auth";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { getPresignedUploadUrl, getPresignedDownloadUrl } from "../services/s3";
import { sendSupportNotification, sendTicketConfirmation } from "../services/email";
import crypto from "crypto";

const uploadUrlSchema = z.object({
  filename: z.string().min(1).max(500),
  contentType: z.string().min(1).max(200),
}).strip();

const createTicketSchema = z.object({
  type: z.enum(["bug", "feature", "question", "other"]),
  subject: z.string().min(1).max(500),
  description: z.string().min(1).max(10000),
  email: z.string().email().max(320).optional(),
  // S3 object keys (not URLs) produced by /upload-url. Validated to belong to
  // the requesting user before being stored.
  image_keys: z.array(z.string().min(1).max(512)).max(10).optional(),
}).strip();

const imageUrlSchema = z.object({
  key: z.string().min(1).max(512),
}).strip();

const router = Router();

const ticketLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many support tickets, please try again later" },
});

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

router.post("/upload-url", requireAuth, validateBody(uploadUrlSchema), async (req: AuthRequest, res: Response) => {
  const { filename, contentType } = req.body;

  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    res.status(400).json({ error: "Only PNG, JPEG, GIF, and WebP images are allowed" });
    return;
  }

  const id = crypto.randomUUID();
  // Only derive a safe extension; never use the raw filename in the key.
  const rawExt = (filename.split(".").pop() || "png").toLowerCase();
  const ext = /^[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : "png";
  const key = `support/${req.userId}/${id}.${ext}`;

  const { uploadUrl } = await getPresignedUploadUrl(key, contentType);
  res.json({ uploadUrl, key });
});

// Owner-only: mint a short-lived signed URL to view one of their own uploads.
router.post("/image-url", requireAuth, validateBody(imageUrlSchema), async (req: AuthRequest, res: Response) => {
  const { key } = req.body;
  if (!key.startsWith(`support/${req.userId}/`)) {
    res.status(403).json({ error: "Not allowed" });
    return;
  }
  const url = await getPresignedDownloadUrl(key);
  res.json({ url });
});

router.post("/tickets", ticketLimiter, optionalAuth, validateBody(createTicketSchema), async (req: AuthRequest, res: Response) => {
  const { type, subject, description, email, image_keys } = req.body;

  if (type === "bug" && !req.userId) {
    res.status(401).json({ error: "Bug reports require authentication. Please log in." });
    return;
  }

  const userEmail = req.userEmail || email;
  if (!userEmail) {
    res.status(400).json({ error: "Email is required for unauthenticated submissions" });
    return;
  }

  // Only accept attachment keys that the user actually owns (uploaded under
  // their own prefix). Unauthenticated submissions cannot attach images.
  const keys: string[] = Array.isArray(image_keys) ? image_keys : [];
  if (keys.length > 0 && !req.userId) {
    res.status(400).json({ error: "Attachments require authentication" });
    return;
  }
  const prefix = `support/${req.userId}/`;
  const invalidKey = keys.find((k) => !k.startsWith(prefix));
  if (invalidKey) {
    res.status(400).json({ error: "Invalid attachment reference" });
    return;
  }

  const [ticket] = await db("support_tickets")
    .insert({
      user_id: req.userId || null,
      user_email: userEmail,
      type,
      subject,
      description,
      image_urls: JSON.stringify(keys),
    })
    .returning("*");

  sendSupportNotification(ticket).catch((err) =>
    console.error("[support] Admin notification email failed:", err instanceof Error ? err.message : err),
  );
  sendTicketConfirmation(ticket).catch((err) =>
    console.error("[support] Confirmation email failed:", err instanceof Error ? err.message : err),
  );

  res.status(201).json(ticket);
});

router.get("/tickets", requireAuth, async (req: AuthRequest, res: Response) => {
  const tickets = await db("support_tickets")
    .where({ user_id: req.userId })
    .orderBy("created_at", "desc");

  res.json(tickets);
});

export default router;
