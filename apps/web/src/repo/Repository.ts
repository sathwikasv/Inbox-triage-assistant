import type { Decision, Draft, LintViolation, ThreadFacts, TriageResult } from "@c16/core";

export type AuditType = "import" | "reimport" | "edit_draft" | "edit_decision" | "preview_label" | "preview_archive" | "save" | "quarantine" | "escalate" | "watch" | "archive";
export type ThreadAction = "escalate" | "watch" | "archive";

/** Optional AI pass that ran at import (API only). */
export interface AiStatus {
  status: "ok" | "disabled" | "error" | string;
  model?: string;
  error?: string;
}

export interface ClassifyResult {
  decision: Decision;
  thread: ThreadFacts;
  draft: Draft | null;
  ai: AiStatus;
}

export interface AuditEvent {
  at: string;
  actor: string;
  type: AuditType;
  email_id?: string;
  thread_key?: string;
  detail: string;
}

export interface DraftEdit {
  body: string;
  lint_ok: boolean;
  violations: LintViolation[];
  at: string;
}

/** Reviewer edits are limited to these fields. Policy fields are never editable. */
export type DecisionPatch = Partial<Pick<Decision, "purpose" | "urgency" | "action_needed" | "status">>;
export const EDITABLE_DECISION_FIELDS = ["purpose", "urgency", "action_needed", "status"] as const;

export interface SavedRun {
  runId: string;
  source: string; // file name or "starter fixture"
  result: TriageResult; // as triaged, with reviewer decision edits applied
  reused: boolean; // the same file was imported before; nothing was duplicated
  reviewed: boolean;
  savedAt: string | null;
  edits: Record<string, DraftEdit>; // thread_key → reviewer draft
  decisionEdits: Record<string, DecisionPatch>; // email_id → changed fields
  audit: AuditEvent[];
  storage: "local" | "api";
  ai?: AiStatus;
}

export class LintRejected extends Error {
  constructor(public readonly violations: LintViolation[]) {
    super(`Draft not saved: ${violations.map((v) => v.term).join(", ")}`);
  }
}

export interface Repository {
  readonly kind: "local" | "api";
  importFixture(input: unknown, source: string): Promise<SavedRun>;
  getRun(runId: string): Promise<SavedRun | null>;
  latest(): Promise<SavedRun | null>;
  saveDraft(runId: string, threadKey: string, body: string): Promise<SavedRun>;
  editDecision(runId: string, emailId: string, patch: DecisionPatch): Promise<SavedRun>;
  preview(runId: string, emailId: string, action: "label" | "archive"): Promise<SavedRun>;
  markReviewed(runId: string): Promise<SavedRun>;
  act(runId: string, threadKey: string, action: ThreadAction, opts?: { to?: string; note?: string }): Promise<SavedRun>;
  classify(subject: string, body: string): Promise<ClassifyResult>;
}
