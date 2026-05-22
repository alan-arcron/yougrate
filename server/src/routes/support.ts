import { Router, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "../db";
import type { AuthRequest } from "../middleware/auth";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { getPresignedUploadUrl } from "../services/s3";
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
  image_urls: z.array(z.string().url().max(2000)).max(10).optional(),
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
  const ext = filename.split(".").pop() || "png";
  const key = `support/${req.userId}/${id}.${ext}`;

  const { uploadUrl, publicUrl } = await getPresignedUploadUrl(key, contentType);
  res.json({ uploadUrl, imageUrl: publicUrl });
});

router.post("/tickets", ticketLimiter, optionalAuth, validateBody(createTicketSchema), async (req: AuthRequest, res: Response) => {
  const { type, subject, description, email, image_urls } = req.body;

  if (type === "bug" && !req.userId) {
    res.status(401).json({ error: "Bug reports require authentication. Please log in." });
    return;
  }

  const userEmail = req.userEmail || email;
  if (!userEmail) {
    res.status(400).json({ error: "Email is required for unauthenticated submissions" });
    return;
  }

  const [ticket] = await db("support_tickets")
    .insert({
      user_id: req.userId || null,
      user_email: userEmail,
      type,
      subject,
      description,
      image_urls: JSON.stringify(image_urls || []),
    })
    .returning("*");

  sendSupportNotification(ticket).catch(() => {});
  sendTicketConfirmation(ticket).catch(() => {});

  res.status(201).json(ticket);
});

router.get("/tickets", requireAuth, async (req: AuthRequest, res: Response) => {
  const tickets = await db("support_tickets")
    .where({ user_id: req.userId })
    .orderBy("created_at", "desc");

  res.json(tickets);
});

export default router;
