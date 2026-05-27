import { type Request, type Response, type NextFunction } from "express";
import { type ZodSchema, ZodError } from "zod";

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: "Validation error",
        details: result.error.issues.map((e) => ({
          path: e.path.map(String).join("."),
          message: e.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: "Validation error",
        details: result.error.issues.map((e) => ({
          path: e.path.map(String).join("."),
          message: e.message,
        })),
      });
      return;
    }
    Object.assign(req.query, result.data);
    next();
  };
}
