import { parseFixture } from "./schema.js";
import { sortEmails } from "./normalize.js";
import { POLICY } from "./policy.js";
import type { TriageResult } from "./types.js";

/** Stable hash for idempotent re-import (FNV-1a over canonical JSON). */
export function fixtureHash(input: unknown): string {
  const s = JSON.stringify(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// TODO(A): threading → extract → classify → injection → reconcile → drafts → metrics
export function runTriage(input: unknown): TriageResult {
  const fx = parseFixture(input);
  const ordered = sortEmails(fx.records.emails);
  return {
    case_id: fx.case_id,
    fixture_hash: fixtureHash(input),
    policy: POLICY,
    ordered_email_ids: ordered.map((e) => e.email_id),
    decisions: [],
    threads: [],
    drafts: [],
    metrics: { seeded_total: 7, seeded_recovered: 0, precision_action_flags: 0, checks: [] },
  };
}
