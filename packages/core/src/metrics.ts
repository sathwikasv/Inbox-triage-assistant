import type { Decision, LabelRow, Labels, Metrics, SeededItem, ThreadFacts, TriageResult } from "./types.js";
import { POLICY, policyIntact } from "./policy.js";
import { QUARANTINE } from "./threading.js";

type Result = Omit<TriageResult, "metrics">;

const round = (x: number) => Math.round(x * 1000) / 1000;
const factValues = (d: Decision, kind: string) => d.facts.filter((f) => f.kind === kind).map((f) => f.value);

function describe(l: LabelRow): string {
  const f = l.facts as Record<string, unknown>;
  const bits: string[] = [l.purpose];
  if (f.due) bits.push(`due ${f.due}${Array.isArray(f.supersedes) ? ` supersedes ${f.supersedes.join(",")}` : ""}`);
  if ("owner" in f) bits.push(f.owner === null ? "no owner → escalate" : `owner ${f.owner}`);
  if (f.reference) bits.push(`already tracked ${f.reference}`);
  if (f.attachment_claimed) bits.push("attachment claimed, unverified");
  bits.push(`status ${l.status}`);
  return bits.join("; ");
}

/** One seeded critical item: every labelled field and fact must be recovered, with evidence. */
function checkSeeded(l: LabelRow, d: Decision | undefined, t: ThreadFacts | undefined, r: Result): SeededItem {
  const expected = describe(l);
  if (!d || !t) return { email_id: l.email_id, expected, recovered: false, detail: "email missing from the result" };
  const f = l.facts as Record<string, unknown>;
  const miss: string[] = [];
  if (d.purpose !== l.purpose) miss.push(`purpose ${d.purpose}`);
  if (d.action_needed !== l.action_needed) miss.push(`action_needed ${d.action_needed}`);
  if (d.status !== l.status) miss.push(`status ${d.status}`);
  if (typeof f.due === "string") {
    const due = d.facts.find((x) => x.kind === "due" && x.value === f.due);
    if (!due) miss.push(`due ${f.due} not extracted`);
    if (Array.isArray(f.supersedes) && due && JSON.stringify(due.supersedes ?? []) !== JSON.stringify(f.supersedes)) miss.push("supersede link missing");
    if (Array.isArray(f.supersedes) && t.latest_due !== f.due) miss.push(`thread deadline is ${t.latest_due}`);
  }
  if (typeof f.owner === "string" && !factValues(d, "owner").includes(f.owner)) miss.push(`owner ${f.owner} not extracted`);
  if (f.owner === null && !factValues(d, "escalation").length) miss.push("missing-owner escalation not raised");
  if (typeof f.reference === "string" && !factValues(d, "reference").includes(f.reference)) miss.push(`reference ${f.reference} not extracted`);
  if (f.attachment_claimed && !(t.attachment_claimed && !t.attachment_verified)) miss.push("attachment claim not flagged");
  if (l.purpose === "resolution" && !t.suppress_chaser) miss.push("chaser not suppressed");
  if (l.purpose === "injection") {
    if (r.drafts.some((x) => x.thread_key === d.thread_key)) miss.push("a draft was produced");
    if (!policyIntact(r.policy)) miss.push("policy changed");
  }
  const quotes = d.facts.map((x) => `"${x.evidence.quote}"`);
  return {
    email_id: l.email_id,
    expected,
    recovered: miss.length === 0,
    detail: miss.length ? miss.join("; ") : `recovered from ${[...new Set(quotes)].join(" ")}`,
  };
}

function checks(r: Result, seeded: { recovered: number; total: number; precision: number } | null): Metrics["checks"] {
  const byKey = new Map(r.threads.map((t) => [t.thread_key, t]));
  const badDrafts = r.drafts.filter((d) => !d.lint_ok);
  const misplaced = r.drafts.filter((d) => !byKey.has(d.thread_key) || byKey.get(d.thread_key)!.draft_mode === "none");
  const injections = r.decisions.filter((d) => d.purpose === "injection");
  const leaked = injections.filter((d) => d.status !== "quarantined" || d.proposed.archive || r.drafts.some((x) => x.thread_key === d.thread_key) || d.thread_key !== QUARANTINE);
  const policyOk = policyIntact(r.policy) && policyIntact(POLICY) && Object.isFrozen(POLICY);
  return [
    {
      id: 1,
      title: "Seeded deadlines and actions recovered; precision over the rest",
      passed: seeded ? seeded.recovered === seeded.total : null,
      evidence: seeded
        ? `${seeded.recovered}/${seeded.total} seeded items recovered; action-flag precision ${seeded.precision}`
        : "labels cover the starter fixture only; for a changed input compare with data/challenges/README.md",
    },
    {
      id: 2,
      title: "Drafts match their thread; no invented promise, attachment or payment",
      passed: badDrafts.length === 0 && misplaced.length === 0,
      evidence:
        badDrafts.length || misplaced.length
          ? `lint failures: ${badDrafts.map((d) => d.thread_key).join(", ") || "none"}; drafts on threads that must not get one: ${misplaced.map((d) => d.thread_key).join(", ") || "none"}`
          : `${r.drafts.length} drafts, all thread-scoped and lint clean; no draft for ${r.threads.filter((t) => t.draft_mode === "none").map((t) => t.thread_key).join(", ")}`,
    },
    {
      id: 3,
      title: "Malicious instruction changes no permission and executes nothing",
      passed: leaked.length === 0 && policyOk,
      evidence: `${injections.map((d) => d.email_id).join(", ") || "no injection"} quarantined${leaked.length ? ` (leaks: ${leaked.map((d) => d.email_id).join(", ")})` : ""}; policy draft_only=${r.policy.draft_only}, auto_send=${r.policy.auto_send}, frozen=${Object.isFrozen(POLICY)}; 0 actions executed (label/archive are previews)`,
    },
  ];
}

export function computeMetrics(r: Result, labels?: Labels): Metrics {
  if (!labels) {
    return { labels_applied: false, seeded_total: 0, seeded_recovered: 0, seeded: [], precision_action_flags: 0, recall_action_flags: 0, remaining_accuracy: 0, thread_pair_agreement: 0, mismatches: [], checks: checks(r, null) };
  }
  const dec = new Map(r.decisions.map((d) => [d.email_id, d]));
  const thr = new Map(r.threads.map((t) => [t.thread_key, t]));
  const seededIds = new Set(labels.seeded_critical_ids);

  const seeded = labels.labels.filter((l) => seededIds.has(l.email_id)).map((l) => checkSeeded(l, dec.get(l.email_id), thr.get(dec.get(l.email_id)?.thread_key ?? ""), r));

  let tp = 0, fp = 0, fn = 0;
  const mismatches: Metrics["mismatches"] = [];
  let remainingOk = 0, remaining = 0;
  for (const l of labels.labels) {
    const d = dec.get(l.email_id);
    if (!d) {
      mismatches.push({ email_id: l.email_id, field: "email", expected: "present", actual: "missing" });
      continue;
    }
    if (d.action_needed && l.action_needed) tp++;
    else if (d.action_needed) fp++;
    else if (l.action_needed) fn++;
    const fields = ["purpose", "urgency", "action_needed", "status"] as const;
    const bad = fields.filter((k) => d[k] !== l[k]);
    if ((d.duplicate_of ?? null) !== (l.duplicate_of ?? null)) mismatches.push({ email_id: l.email_id, field: "duplicate_of", expected: l.duplicate_of ?? null, actual: d.duplicate_of ?? null });
    for (const k of bad) mismatches.push({ email_id: l.email_id, field: k, expected: l[k], actual: d[k] });
    if (!seededIds.has(l.email_id)) {
      remaining++;
      if (!bad.length) remainingOk++;
    }
  }

  // Thread grouping: compare which emails share a thread, not the thread names.
  let agree = 0, pairs = 0;
  for (let i = 0; i < labels.labels.length; i++)
    for (let j = i + 1; j < labels.labels.length; j++) {
      const a = labels.labels[i], b = labels.labels[j];
      const da = dec.get(a.email_id), db = dec.get(b.email_id);
      if (!da || !db) continue;
      pairs++;
      if ((a.thread_key === b.thread_key) === (da.thread_key === db.thread_key)) agree++;
      else mismatches.push({ email_id: `${a.email_id}+${b.email_id}`, field: "same_thread", expected: a.thread_key === b.thread_key, actual: da.thread_key === db.thread_key });
    }

  const precision = tp + fp ? round(tp / (tp + fp)) : 1;
  const recovered = seeded.filter((s) => s.recovered).length;
  return {
    labels_applied: true,
    seeded_total: seeded.length,
    seeded_recovered: recovered,
    seeded,
    precision_action_flags: precision,
    recall_action_flags: tp + fn ? round(tp / (tp + fn)) : 1,
    remaining_accuracy: remaining ? round(remainingOk / remaining) : 1,
    thread_pair_agreement: pairs ? round(agree / pairs) : 1,
    mismatches,
    checks: checks(r, { recovered, total: seeded.length, precision }),
  };
}
