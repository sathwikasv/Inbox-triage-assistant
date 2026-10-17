// Shared contract between core, api and web. Change only after a 3-way sync.

export type Purpose =
  | "request"
  | "correction"
  | "resolution"
  | "duplicate"
  | "status_update"
  | "fyi"
  | "commitment"
  | "question"
  | "blocker"
  | "injection";

export type Urgency = "high" | "medium" | "low" | "n/a";
export type TaskStatus = "open" | "in_progress" | "blocked" | "closed" | "quarantined" | "needs_review";

export interface RawEmail {
  email_id: string;
  subject: string;
  body: string;
  received_at: string | null; // ISO 8601 with offset; null = unknown (kept, flagged for review)
  expected_action?: string;
  synthetic?: boolean;
}

export interface Policy {
  readonly draft_only: true;
  readonly auto_send: false;
}

export interface Fixture {
  case_id: string;
  records: { emails: RawEmail[]; policy: Policy };
  [k: string]: unknown;
}

export interface Evidence {
  email_id: string;
  quote: string; // exact substring of the source body
}

export type FactKind =
  | "task"
  | "owner"
  | "due"
  | "status"
  | "reference"
  | "attachment_claim"
  | "injection"
  | "constraint"
  | "commitment"
  | "clarify"
  | "escalation";

export interface Fact {
  kind: FactKind;
  value: string;
  evidence: Evidence;
  supersedes?: string[]; // email_ids whose fact this replaces
  superseded_by?: string; // email_id of the fact that replaced this one
}

/** Label/archive suggestions. Shown as a preview only; nothing is ever executed. */
export interface ProposedActions {
  labels: string[];
  archive: boolean;
  reason: string;
}

export interface Decision {
  email_id: string;
  subject: string;
  received_at: string | null;
  thread_key: string;
  purpose: Purpose;
  urgency: Urgency;
  action_needed: boolean;
  status: TaskStatus;
  duplicate_of?: string;
  facts: Fact[];
  proposed: ProposedActions;
  explain: { purpose: string; urgency: string; thread: string };
  notes: string[];
}

export interface DueEntry {
  date: string; // YYYY-MM-DD
  email_id: string;
  quote: string;
  from_correction: boolean;
  superseded_by?: string;
}

export interface ThreadFacts {
  thread_key: string;
  title: string;
  task?: string;
  owner?: string | null; // null = explicitly unowned
  latest_due?: string | null; // YYYY-MM-DD
  due_history: DueEntry[];
  status: TaskStatus;
  action_needed: boolean; // needs a human now, after reconciling the whole thread
  references: string[];
  attachment_claimed: boolean;
  attachment_verified: false; // the schema carries no attachments, so a claim can never be verified
  suppress_chaser: boolean;
  escalation: string | null;
  duplicate_count: number;
  watch_date: string | null;
  clarify: string[];
  constraints: string[];
  inferred_links: { email_id: string; rule: string }[];
  draft_mode: "reply" | "ack" | "none";
  draft_reason: string;
  email_ids: string[];
}

export interface LintViolation {
  term: string;
  reason: string;
}

export interface Draft {
  thread_key: string;
  body: string;
  source: "template" | "model-assist";
  lint_ok: boolean;
  violations: LintViolation[];
}

export interface SeededItem {
  email_id: string;
  expected: string;
  recovered: boolean;
  detail: string;
}

export interface Metrics {
  labels_applied: boolean;
  seeded_total: number;
  seeded_recovered: number;
  seeded: SeededItem[];
  precision_action_flags: number;
  recall_action_flags: number;
  remaining_accuracy: number; // share of non-seeded decisions that match the labels
  thread_pair_agreement: number; // pairwise same-thread agreement with the labels
  mismatches: { email_id: string; field: string; expected: unknown; actual: unknown }[];
  checks: { id: 1 | 2 | 3; title: string; passed: boolean | null; evidence: string }[]; // null = not applicable to this input
}

export interface TriageResult {
  case_id: string;
  fixture_hash: string;
  policy: Policy;
  ordered_email_ids: string[];
  decisions: Decision[];
  threads: ThreadFacts[];
  drafts: Draft[];
  metrics: Metrics;
  warnings: string[];
}

/** Shape of data/labels/C16_labels.json. */
export interface LabelRow {
  email_id: string;
  thread_key: string;
  purpose: Purpose;
  urgency: Urgency;
  action_needed: boolean;
  status: TaskStatus;
  duplicate_of?: string;
  facts: Record<string, unknown>;
}

export interface Labels {
  case_id: string;
  seeded_critical_ids: string[];
  labels: LabelRow[];
  forbidden_draft_terms?: string[];
}
