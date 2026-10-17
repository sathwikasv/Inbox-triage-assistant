import { parseFixture } from "./schema.js";
import { sortEmails, dedupeById } from "./normalize.js";
import { POLICY, policyIntact } from "./policy.js";
import { analyzeEmail } from "./analyze.js";
import { assignThreads } from "./threading.js";
import { reconcile } from "./reconcile.js";
import { buildDrafts } from "./drafts/index.js";
import type { Metrics, RawEmail, TriageResult } from "./types.js";

/** JSON with object keys sorted, so key order in the file does not change the hash. */
function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/** Stable hash for idempotent re-import (FNV-1a over canonical JSON). */
export function fixtureHash(input: unknown): string {
  const s = canonicalJson(typeof input === "string" ? JSON.parse(input) : input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export const EMPTY_METRICS: Metrics = {
  labels_applied: false,
  seeded_total: 0,
  seeded_recovered: 0,
  seeded: [],
  precision_action_flags: 0,
  recall_action_flags: 0,
  remaining_accuracy: 0,
  thread_pair_agreement: 0,
  mismatches: [],
  checks: [],
};

export function runTriage(input: unknown): TriageResult {
  const fx = parseFixture(input);
  const { emails, warnings } = dedupeById(fx.records.emails as RawEmail[]);
  const ordered = sortEmails(emails);
  for (const e of ordered) if (e.received_at === null) warnings.push(`${e.email_id} has received_at: null (unknown); placed last and flagged for review.`);

  const analyzed = ordered.map(analyzeEmail);
  const { decisions, threads } = reconcile(analyzed, assignThreads(analyzed));

  if (!policyIntact(POLICY) || !Object.isFrozen(POLICY)) throw new Error("policy changed during triage; refusing to return a result");
  return {
    case_id: fx.case_id,
    fixture_hash: fixtureHash(input),
    policy: POLICY,
    ordered_email_ids: ordered.map((e) => e.email_id),
    decisions,
    threads,
    drafts: buildDrafts(threads, decisions),
    metrics: EMPTY_METRICS,
    warnings,
  };
}
