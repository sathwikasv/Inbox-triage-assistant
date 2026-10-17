import type { NextFunction, Request, Response } from "express";
import { z, type ZodTypeAny } from "zod";

/** Validate req.body; unknown keys are rejected (.strict) so nothing outside the whitelist can be written. */
export function validateBody(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      return res.status(400).json({
        error: "invalid request",
        issues: r.error.issues.map((i) => ({ path: i.path.join(".") || "(body)", message: i.message })),
      });
    }
    req.body = r.data;
    next();
  };
}

export const DecisionPatchSchema = z
  .object({
    purpose: z.enum(["request", "correction", "resolution", "duplicate", "status_update", "fyi", "commitment", "question", "blocker"]).optional(),
    urgency: z.enum(["high", "medium", "low", "n/a"]).optional(),
    action_needed: z.boolean().optional(),
    status: z.enum(["open", "in_progress", "blocked", "closed", "needs_review"]).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "at least one editable field is required");

export const DraftPutSchema = z.object({ body: z.string().min(1).max(5000) }).strict();
export const PreviewSchema = z.object({ email_id: z.string().min(1), action: z.enum(["label", "archive"]) }).strict();
