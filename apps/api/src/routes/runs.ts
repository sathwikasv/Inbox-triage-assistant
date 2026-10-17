import { Router, type NextFunction, type Request, type Response } from "express";
import { Types } from "mongoose";
import { FixtureError, QUARANTINE, computeMetrics, lintDraft, type TriageResult } from "@c16/core";
import { TriageRun } from "../models/TriageRun.js";
import { Decision } from "../models/Decision.js";
import { Draft } from "../models/Draft.js";
import { ActionSchema, DecisionPatchSchema, DraftPutSchema, PreviewSchema, validateBody } from "../middleware/validate.js";
import { audit, importRun, labelsFor, loadRun } from "../services/triage.js";

export const runsRouter = Router();

type Handler = (req: Request<Record<string, string>>, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => (req: Request<Record<string, string>>, res: Response, next: NextFunction) => fn(req, res).catch(next);

async function snapshot(id: string): Promise<TriageResult | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const run = await TriageRun.findById(id).select("result").lean();
  return run ? (run.result as TriageResult) : null;
}

// POST /runs — import + triage. Body: the fixture itself, or { fixture, source }. Idempotent by fixture hash.
runsRouter.post(
  "/",
  wrap(async (req, res) => {
    const wrapped = req.body && typeof req.body === "object" && "fixture" in req.body;
    const input = wrapped ? req.body.fixture : req.body;
    const source = wrapped && typeof req.body.source === "string" ? req.body.source.slice(0, 200) : "api upload";
    try {
      const { created, run } = await importRun(input, source);
      return res.status(created ? 201 : 200).json(run);
    } catch (e) {
      if (e instanceof FixtureError) return res.status(400).json({ error: "invalid fixture", issues: e.issues });
      if (/appears twice with different content/.test((e as Error).message)) return res.status(400).json({ error: "invalid fixture", issues: [{ path: "records.emails", message: (e as Error).message }] });
      throw e;
    }
  }),
);

// GET /runs/latest — the most recently updated run (lets the web app reopen where the reviewer left off).
runsRouter.get(
  "/latest",
  wrap(async (_req, res) => {
    const run = await TriageRun.findOne().sort({ updatedAt: -1 }).select("_id").lean();
    if (!run) return res.json(null); // no runs yet is not an error
    return res.json(await loadRun(String(run._id)));
  }),
);

runsRouter.get(
  "/:id",
  wrap(async (req, res) => {
    const run = await loadRun(req.params.id);
    return run ? res.json(run) : res.status(404).json({ error: "run not found" });
  }),
);

// PATCH /runs/:id/decisions/:emailId — reviewer edits: purpose / urgency / action_needed / status only.
runsRouter.patch(
  "/:id/decisions/:emailId",
  validateBody(DecisionPatchSchema),
  wrap(async (req, res) => {
    if (!Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: "run not found" });
    const d = await Decision.findOne({ runId: req.params.id, emailId: req.params.emailId });
    if (!d) return res.status(404).json({ error: "decision not found" });
    if (d.quarantined || d.threadKey === QUARANTINE) return res.status(409).json({ error: "quarantined emails are read-only; escalate them instead" });
    const patch = req.body as Record<string, unknown>;
    const before = { purpose: d.purpose, urgency: d.urgency, action_needed: d.actionNeeded, status: d.status } as Record<string, unknown>;
    d.edits = { ...(d.edits ?? {}), ...patch };
    d.reviewerEdited = true;
    if (patch.purpose) d.purpose = patch.purpose as string;
    if (patch.urgency) d.urgency = patch.urgency as string;
    if (typeof patch.action_needed === "boolean") d.actionNeeded = patch.action_needed;
    if (patch.status) d.status = patch.status as string;
    d.markModified("edits");
    await d.save();
    await TriageRun.updateOne({ _id: req.params.id }, { reviewed: false });
    await audit(req.params.id, { type: "edit_decision", emailId: d.emailId, threadKey: d.threadKey, detail: Object.entries(patch).map(([k, v]) => `${k}: ${String(before[k])} → ${String(v)}`).join(", ") });
    return res.json(await loadRun(req.params.id));
  }),
);

// PUT /runs/:id/drafts/:threadKey — reviewer draft; the lint runs again on the server. 422 on any forbidden claim.
runsRouter.put(
  "/:id/drafts/:threadKey",
  validateBody(DraftPutSchema),
  wrap(async (req, res) => {
    const result = await snapshot(req.params.id);
    if (!result) return res.status(404).json({ error: "run not found" });
    const thread = result.threads.find((t) => t.thread_key === req.params.threadKey);
    if (!thread || thread.draft_mode === "none") return res.status(404).json({ error: `thread ${req.params.threadKey} does not take a reply` });
    const lint = lintDraft(req.body.body, thread);
    if (!lint.ok) return res.status(422).json({ error: "draft rejected by lint", violations: lint.violations });
    await Draft.updateOne({ runId: req.params.id, threadKey: thread.thread_key }, { editedBody: req.body.body, editedAt: new Date() });
    await TriageRun.updateOne({ _id: req.params.id }, { reviewed: false });
    await audit(req.params.id, { type: "edit_draft", threadKey: thread.thread_key, detail: `draft edited (${req.body.body.length} chars), lint clean` });
    return res.json(await loadRun(req.params.id));
  }),
);

// POST /runs/:id/preview — label/archive preview. Records an audit event only; nothing is ever executed.
runsRouter.post(
  "/:id/preview",
  validateBody(PreviewSchema),
  wrap(async (req, res) => {
    const result = await snapshot(req.params.id);
    if (!result) return res.status(404).json({ error: "run not found" });
    const d = result.decisions.find((x) => x.email_id === req.body.email_id);
    if (!d) return res.status(404).json({ error: "email not found" });
    const detail =
      req.body.action === "label"
        ? `would apply labels [${d.proposed.labels.join(", ")}]: preview only, nothing changed`
        : d.proposed.archive
          ? `would archive (${d.proposed.reason}): preview only, nothing changed`
          : `archive not proposed (${d.proposed.reason}): nothing changed`;
    await audit(req.params.id, { type: req.body.action === "label" ? "preview_label" : "preview_archive", emailId: d.email_id, threadKey: d.thread_key, detail });
    return res.json(await loadRun(req.params.id));
  }),
);

// POST /runs/:id/actions: escalate / watch / archive a thread. Recorded in the audit trail only; nothing is sent or moved.
runsRouter.post(
  "/:id/actions",
  validateBody(ActionSchema),
  wrap(async (req, res) => {
    const result = await snapshot(req.params.id);
    if (!result) return res.status(404).json({ error: "run not found" });
    const t = result.threads.find((x) => x.thread_key === req.body.thread_key);
    if (!t) return res.status(404).json({ error: "thread not found" });
    const { action, to, note } = req.body as { action: string; to?: string; note?: string };
    if (action === "archive" && t.thread_key === QUARANTINE) return res.status(409).json({ error: "quarantined mail is never archived; escalate it" });
    const detail =
      action === "escalate"
        ? `escalated to ${to ?? "the team lead"}${note ? `: ${note}` : ""} (recorded; no message sent)`
        : action === "watch"
          ? `watching${t.watch_date ? ` until ${t.watch_date}` : ""}${note ? `: ${note}` : ""}`
          : `marked for archive (${t.email_ids.length} email(s)); preview only, mailbox unchanged`;
    await audit(req.params.id, { type: action, threadKey: t.thread_key, detail });
    return res.json(await loadRun(req.params.id));
  }),
);

// POST /runs/:id/save — mark the reviewed result as saved.
runsRouter.post(
  "/:id/save",
  wrap(async (req, res) => {
    if (!Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: "run not found" });
    const run = await TriageRun.findByIdAndUpdate(req.params.id, { reviewed: true, savedAt: new Date() });
    if (!run) return res.status(404).json({ error: "run not found" });
    const [drafts, decisions] = await Promise.all([Draft.countDocuments({ runId: run._id, editedBody: { $ne: null } }), Decision.countDocuments({ runId: run._id, reviewerEdited: true })]);
    await audit(run._id, { type: "save", detail: `reviewed result saved: ${drafts} edited draft(s), ${decisions} edited decision(s)` });
    return res.json(await loadRun(req.params.id));
  }),
);

// GET /runs/:id/metrics — engine metrics, plus the same metrics after reviewer edits.
runsRouter.get(
  "/:id/metrics",
  wrap(async (req, res) => {
    const run = await loadRun(req.params.id);
    if (!run) return res.status(404).json({ error: "run not found" });
    return res.json({ engine: run.result.metrics, after_review: computeMetrics(run.result, labelsFor(run.result.fixture_hash)) });
  }),
);
