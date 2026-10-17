import { parseFixture } from "./schema.js";
import { sortEmails, dedupeById } from "./normalize.js";
import { POLICY, policyIntact } from "./policy.js";
import { analyzeEmail } from "./analyze.js";
import { assignThreads } from "./threading.js";
import { reconcile } from "./reconcile.js";
import { buildDrafts } from "./drafts/index.js";
import { computeMetrics } from "./metrics.js";
import { route } from "./route.js";
import type { AiPrediction, Labels, RawEmail, TriageResult } from "./types.js";

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

/**
 * Import → validate → order → analyze → thread → reconcile → draft → measure.
 * Pass labels only for the input they were written for (the starter fixture); otherwise Check 1 is reported as not applicable.
 */
export function runTriage(input: unknown, opts: { labels?: Labels; ai?: Record<string, AiPrediction> } = {}): TriageResult {
  const fx = parseFixture(input);
  const { emails, warnings } = dedupeById(fx.records.emails as RawEmail[]);
  const ordered = sortEmails(emails);
  for (const e of ordered) if (e.received_at === null) warnings.push(`${e.email_id} has received_at: null (unknown); placed last and flagged for review.`);

  const analyzed = ordered.map((e) => analyzeEmail(e, opts.ai?.[e.email_id]));
  const { decisions, threads } = reconcile(analyzed, assignThreads(analyzed));
  const asOf = ordered.filter((e) => e.received_at).at(-1)?.received_at ?? null;
  route(threads, decisions, asOf);

  if (!policyIntact(POLICY) || !Object.isFrozen(POLICY)) throw new Error("policy changed during triage; refusing to return a result");
  const result = {
    case_id: fx.case_id,
    fixture_hash: fixtureHash(input),
    policy: POLICY,
    ordered_email_ids: ordered.map((e) => e.email_id),
    as_of: asOf,
    decisions,
    threads,
    drafts: buildDrafts(threads, decisions),
    warnings,
  };
  return { ...result, metrics: computeMetrics(result, opts.labels) };
}
