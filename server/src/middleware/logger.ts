import type { Request, Response, NextFunction } from "express";
import type { AuthRequest } from "./auth";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  if (req.path === "/api/health") {
    next();
    return;
  }

  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const userId = (req as AuthRequest).userId?.slice(0, 8) || "-";
    console.log(
      `[req] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms user:${userId}`,
    );
  });

  next();
}
