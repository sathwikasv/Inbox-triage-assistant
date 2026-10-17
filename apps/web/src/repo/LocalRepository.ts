import { runTriage, lintDraft, fixtureHash, QUARANTINE, type TriageResult } from "@c16/core";
import { labelsFor } from "../lib/starter";
import { EDITABLE_DECISION_FIELDS, LintRejected, type AuditEvent, type ClassifyResult, type DecisionPatch, type Repository, type Role, type SavedRun, type ThreadAction } from "./Repository";

const KEY = "c16.runs.v1";
const LATEST = "c16.latest.v1";
const ACTOR = "reviewer (this browser)";

// localStorage can be missing or blocked (private mode, previews); fall back to memory so the app still works.
const memory = new Map<string, string>();
const store = {
  get(k: string): string | null {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return memory.get(k) ?? null;
    }
  },
  set(k: string, v: string) {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      memory.set(k, v);
    }
  },
};

function readAll(): Record<string, SavedRun> {
  try {
    return JSON.parse(store.get(KEY) ?? "{}");
  } catch {
    return {};
  }
}

const now = () => new Date().toISOString();

/** Re-apply reviewer decision edits on top of a freshly triaged result. */
export function applyDecisionEdits(result: TriageResult, edits: Record<string, DecisionPatch>): TriageResult {
  return { ...result, decisions: result.decisions.map((d) => (edits[d.email_id] ? { ...d, ...edits[d.email_id] } : d)) };
}

/** Browser-only persistence behind the same interface as the API. Used for the demo fallback (VITE_REPO=local). */
export class LocalRepository implements Repository {
  readonly kind = "local" as const;

  private write(run: SavedRun): SavedRun {
    const all = readAll();
    all[run.runId] = run;
    store.set(KEY, JSON.stringify(all));
    store.set(LATEST, run.runId);
    return run;
  }

  private must(runId: string): SavedRun {
    const r = readAll()[runId];
    if (!r) throw new Error(`run ${runId} not found`);
    return r;
  }

  private log(run: SavedRun, e: Omit<AuditEvent, "at" | "actor">): SavedRun {
    return { ...run, audit: [...run.audit, { at: now(), actor: ACTOR, ...e }] };
  }

  async importFixture(input: unknown, source: string): Promise<SavedRun> {
    const hash = fixtureHash(input);
    const runId = `local-${hash}`;
    const existing = readAll()[runId];
    if (existing) {
      // Idempotent re-import: same content → same run, edits kept, nothing duplicated.
      return this.write(this.log({ ...existing, reused: true }, { type: "reimport", detail: `${source} has the same content (hash ${hash}); existing run reused` }));
    }
    const result = runTriage(input, { labels: labelsFor(hash) }); // throws FixtureError on bad input
    let run: SavedRun = { runId, source, result, reused: false, reviewed: false, savedAt: null, edits: {}, decisionEdits: {}, audit: [], storage: "local" };
    run = this.log(run, { type: "import", detail: `${source}: ${result.decisions.length} emails, ${result.threads.length} threads, hash ${hash}` });
    for (const d of result.decisions.filter((d) => d.status === "quarantined"))
      run = this.log(run, { type: "quarantine", email_id: d.email_id, thread_key: d.thread_key, detail: d.explain.purpose });
    return this.write(run);
  }

  async getRun(runId: string) {
    return readAll()[runId] ?? null;
  }

  async latest() {
    const id = store.get(LATEST);
    return id ? (readAll()[id] ?? null) : null;
  }

  async saveDraft(runId: string, threadKey: string, body: string) {
    const run = this.must(runId);
    const thread = run.result.threads.find((t) => t.thread_key === threadKey);
    if (!thread || thread.draft_mode === "none") throw new Error(`thread ${threadKey} does not take a reply`);
    const lint = lintDraft(body, thread);
    if (!lint.ok) throw new LintRejected(lint.violations);
    const edits = { ...run.edits, [threadKey]: { body, lint_ok: true, violations: [], at: now() } };
    const approvals = { ...(run.approvals ?? {}) };
    const hadApproval = !!approvals[threadKey];
    delete approvals[threadKey]; // an edited draft needs a fresh sign-off
    return this.write(
      this.log({ ...run, edits, approvals, reviewed: false }, { type: "edit_draft", thread_key: threadKey, detail: `draft edited (${body.length} chars), lint clean${hadApproval ? "; previous approval withdrawn" : ""}` }),
    );
  }

  async editDecision(runId: string, emailId: string, patch: DecisionPatch) {
    const run = this.must(runId);
    const d = run.result.decisions.find((x) => x.email_id === emailId);
    if (!d) throw new Error(`email ${emailId} not found`);
    if (d.thread_key === QUARANTINE) throw new Error("quarantined emails are read-only; escalate them instead");
    const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => (EDITABLE_DECISION_FIELDS as readonly string[]).includes(k))) as DecisionPatch;
    const decisionEdits = { ...run.decisionEdits, [emailId]: { ...run.decisionEdits[emailId], ...clean } };
    const changes = Object.entries(clean).map(([k, v]) => `${k}: ${String((d as unknown as Record<string, unknown>)[k])} → ${String(v)}`).join(", ");
    const result = applyDecisionEdits(run.result, { [emailId]: clean });
    return this.write(this.log({ ...run, result, decisionEdits, reviewed: false }, { type: "edit_decision", email_id: emailId, thread_key: d.thread_key, detail: changes }));
  }

  async preview(runId: string, emailId: string, action: "label" | "archive") {
    const run = this.must(runId);
    const d = run.result.decisions.find((x) => x.email_id === emailId);
    if (!d) throw new Error(`email ${emailId} not found`);
    const detail =
      action === "label"
        ? `would apply labels [${d.proposed.labels.join(", ")}]: preview only, nothing changed`
        : d.proposed.archive
          ? `would archive (${d.proposed.reason}): preview only, nothing changed`
          : `archive not proposed (${d.proposed.reason}): nothing changed`;
    return this.write(this.log(run, { type: action === "label" ? "preview_label" : "preview_archive", email_id: emailId, thread_key: d.thread_key, detail }));
  }

  async markReviewed(runId: string) {
    const run = this.must(runId);
    const at = now();
    const n = Object.keys(run.edits).length;
    return this.write(this.log({ ...run, reviewed: true, savedAt: at }, { type: "save", detail: `reviewed result saved: ${n} edited draft(s), ${Object.keys(run.decisionEdits).length} edited decision(s)` }));
  }

  async act(runId: string, threadKey: string, action: ThreadAction, opts: { to?: string; note?: string } = {}) {
    const run = this.must(runId);
    const t = run.result.threads.find((x) => x.thread_key === threadKey);
    if (!t) throw new Error(`thread ${threadKey} not found`);
    if (action === "archive" && t.thread_key === QUARANTINE) throw new Error("quarantined mail is never archived; escalate it");
    const note = opts.note ? `: ${opts.note}` : "";
    const detail =
      action === "escalate"
        ? `escalated to ${opts.to ?? "the team lead"}${note} (recorded; no message sent)`
        : action === "watch"
          ? `watching${t.watch_date ? ` until ${t.watch_date}` : ""}${note}`
          : `marked for archive (${t.email_ids.length} email(s)); preview only, mailbox unchanged`;
    return this.write(this.log(run, { type: action, thread_key: threadKey, detail }));
  }

  async approveDraft(runId: string, threadKey: string, role: Role) {
    if (role !== "approver") throw new Error("only an Approver can sign off drafts");
    const run = this.must(runId);
    const t = run.result.threads.find((x) => x.thread_key === threadKey);
    if (!t || t.draft_mode === "none") throw new Error(`thread ${threadKey} has no draft to approve`);
    const body = run.edits[threadKey]?.body ?? run.result.drafts.find((d) => d.thread_key === threadKey)?.body ?? "";
    if (!lintDraft(body, t).ok) throw new Error("the draft fails the lint; fix it before approval");
    const approvals = { ...(run.approvals ?? {}), [threadKey]: { by: "approver", at: now() } };
    return this.write(this.log({ ...run, approvals }, { type: "approve_draft", thread_key: threadKey, detail: "draft approved by Approver; still draft-only, nothing sent" }));
  }

  async classify(subject: string, body: string): Promise<ClassifyResult> {
    // Browser-only mode has no AI key: rules only.
    const email = { email_id: "P1", subject: subject || "(no subject)", body, received_at: new Date().toISOString() };
    const r = runTriage({ case_id: "C16", records: { emails: [email], policy: { draft_only: true, auto_send: false } } });
    return { decision: r.decisions[0], thread: r.threads[0], draft: r.drafts[0] ?? null, ai: { status: "disabled" } };
  }
}
