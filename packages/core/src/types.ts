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
  received_at: string; // ISO 8601 with offset
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

export interface Fact {
  kind: "task" | "owner" | "due" | "status" | "reference" | "attachment_claim" | "injection";
  value: string;
  evidence: Evidence;
  supersedes?: string[]; // email_ids whose fact this replaces
}

export interface Decision {
  email_id: string;
  thread_key: string;
  purpose: Purpose;
  urgency: Urgency;
  action_needed: boolean;
  status: TaskStatus;
  duplicate_of?: string;
  facts: Fact[];
  notes: string[];
}

export interface ThreadFacts {
  thread_key: string;
  task?: string;
  owner?: string | null;
  latest_due?: string | null; // YYYY-MM-DD
  status: TaskStatus;
  references: string[];
  attachment_claimed: boolean;
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

export interface Metrics {
  seeded_total: number;
  seeded_recovered: number;
  precision_action_flags: number;
  checks: { id: 1 | 2 | 3; passed: boolean; evidence: string }[];
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
}
