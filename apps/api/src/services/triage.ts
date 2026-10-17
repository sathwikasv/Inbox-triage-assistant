import { readFileSync } from "node:fs";
import { Types } from "mongoose";
import { runTriage, fixtureHash, type Labels, type TriageResult } from "@c16/core";
import { TriageRun } from "../models/TriageRun.js";
import { Decision } from "../models/Decision.js";
import { Draft } from "../models/Draft.js";
import { AuditEvent } from "../models/AuditEvent.js";

// Labels are ground truth for the starter fixture only (same depth from src/ and dist/).
const LABELS: Labels = JSON.parse(readFileSync(new URL("../../../../data/labels/C16_labels.json", import.meta.url), "utf8"));
const STARTER_HASH = fixtureHash(JSON.parse(readFileSync(new URL("../../../../data/fixture/C16/fixture.json", import.meta.url), "utf8")));

export function labelsFor(hash: string): Labels | undefined {
  return hash === STARTER_HASH ? LABELS : undefined;
}

export async function audit(runId: Types.ObjectId | string, e: { type: string; emailId?: string; threadKey?: string; detail: string; actor?: string }) {
  await AuditEvent.create({ runId, actor: e.actor ?? "reviewer", ...e });
}

/** Same shape as the web app's SavedRun, so the web can switch between local and API storage. */
export async function loadRun(id: string, reused = false) {
  if (!Types.ObjectId.isValid(id)) return null;
  const run = await TriageRun.findById(id).lean();
  if (!run) return null;
  const [decisions, drafts, events] = await Promise.all([
    Decision.find({ runId: run._id }).lean(),
    Draft.find({ runId: run._id }).lean(),
    AuditEvent.find({ runId: run._id }).sort({ at: 1, _id: 1 }).lean(),
  ]);
  const snapshot = run.result as TriageResult;
  const editsById = new Map(decisions.map((d) => [d.emailId, (d.edits ?? {}) as Record<string, unknown>]));
  const result: TriageResult = { ...snapshot, decisions: snapshot.decisions.map((d) => ({ ...d, ...editsById.get(d.email_id) })) };
  return {
    runId: String(run._id),
    source: run.source,
    result,
    reused,
    reviewed: run.reviewed,
    savedAt: run.savedAt ? new Date(run.savedAt).toISOString() : null,
    edits: Object.fromEntries(drafts.filter((d) => d.editedBody).map((d) => [d.threadKey, { body: d.editedBody!, lint_ok: true, violations: [], at: new Date(d.editedAt!).toISOString() }])),
    decisionEdits: Object.fromEntries(decisions.filter((d) => d.reviewerEdited).map((d) => [d.emailId, d.edits])),
    audit: events.map((e) => ({ at: new Date(e.at).toISOString(), actor: e.actor, type: e.type, email_id: e.emailId ?? undefined, thread_key: e.threadKey ?? undefined, detail: e.detail })),
    storage: "api" as const,
  };
}

/**
 * Import + triage. Idempotent by fixture hash: the same content returns the existing run (edits kept,
 * nothing duplicated). Throws FixtureError for invalid input.
 */
export async function importRun(input: unknown, source: string) {
  const hash = fixtureHash(input);
  const existing = await TriageRun.findOne({ fixtureHash: hash }).select("_id").lean();
  if (existing) {
    await audit(existing._id, { type: "reimport", detail: `${source} has the same content (hash ${hash}); existing run reused` });
    return { created: false, run: (await loadRun(String(existing._id), true))! };
  }

  const labels = labelsFor(hash);
  const result = runTriage(input, { labels });
  let run;
  try {
    run = await TriageRun.create({ fixtureHash: hash, caseId: result.case_id, source, labelsApplied: !!labels, result });
  } catch (e) {
    // Two imports of the same file at once: the unique index keeps one run.
    if ((e as { code?: number }).code === 11000) return importRun(input, source);
    throw e;
  }
  await Decision.insertMany(
    result.decisions.map((d) => ({
      runId: run._id,
      emailId: d.email_id,
      threadKey: d.thread_key,
      purpose: d.purpose,
      urgency: d.urgency,
      actionNeeded: d.action_needed,
      status: d.status,
      duplicateOf: d.duplicate_of ?? null,
      facts: d.facts,
      quarantined: d.status === "quarantined",
    })),
  );
  await Draft.insertMany(result.drafts.map((d) => ({ runId: run._id, threadKey: d.thread_key, body: d.body, source: d.source, lintOk: d.lint_ok, violations: d.violations })));
  await audit(run._id, { type: "import", detail: `${source}: ${result.decisions.length} emails, ${result.threads.length} threads, hash ${hash}` });
  for (const d of result.decisions.filter((x) => x.status === "quarantined"))
    await audit(run._id, { type: "quarantine", emailId: d.email_id, threadKey: d.thread_key, detail: d.explain.purpose, actor: "system" });
  return { created: true, run: (await loadRun(String(run._id)))! };
}
