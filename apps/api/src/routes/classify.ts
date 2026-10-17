import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { runTriage } from "@c16/core";
import { validateBody } from "../middleware/validate.js";
import { classifyEmails } from "../services/ai.js";

export const classifyRouter = Router();

// Small per-IP limit so the playground cannot burn the free AI quota.
const WINDOW_MS = 60_000;
const LIMIT = 20;
const hits = new Map<string, number[]>();
function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) return res.status(429).json({ error: "too many requests; try again in a minute" });
  hits.set(key, [...recent, now]);
  next();
}

const ClassifySchema = z
  .object({
    subject: z.string().max(300).optional(),
    body: z.string().min(1, "paste an email body").max(5000),
  })
  .strict();

// POST /classify: triage one pasted email (rules + optional AI). Nothing is stored.
classifyRouter.post("/", rateLimit, validateBody(ClassifySchema), (req, res, next) => {
  (async () => {
    const email = { email_id: "P1", subject: req.body.subject ?? "(no subject)", body: req.body.body as string, received_at: new Date().toISOString() };
    const ai = await classifyEmails([email]);
    const r = runTriage({ case_id: "C16", records: { emails: [email], policy: { draft_only: true, auto_send: false } } }, { ai: ai.predictions });
    res.json({
      decision: r.decisions[0],
      thread: r.threads[0],
      draft: r.drafts[0] ?? null,
      policy: r.policy,
      ai: { status: ai.status, model: ai.model, error: ai.error, ms: ai.ms },
    });
  })().catch(next);
});
