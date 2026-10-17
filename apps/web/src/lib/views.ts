import type { Decision, NextActionKind, ThreadFacts, TriageResult, Urgency } from "@c16/core";

export interface View {
  id: string;
  label: string;
  icon: string;
  test: (t: ThreadFacts, ds: Decision[]) => boolean;
}

const needsReview = (t: ThreadFacts, ds: Decision[]) => ds.some((d) => d.review?.needed) || t.inferred_links.length > 0;

export const VIEWS: View[] = [
  { id: "all", label: "All threads", icon: "inbox", test: () => true },
  { id: "action", label: "Needs action", icon: "reply", test: (t) => t.action_needed && t.thread_key !== "QUARANTINE" },
  { id: "escalations", label: "Escalations", icon: "escalate", test: (t) => t.next_action.kind === "escalate" || t.escalations.length > 0 },
  { id: "review", label: "Needs review", icon: "review", test: needsReview },
  { id: "watch", label: "Waiting on sender", icon: "eye", test: (t) => t.next_action.kind === "watch" },
  { id: "resolved", label: "Resolved", icon: "check", test: (t) => t.status === "closed" },
  { id: "quarantine", label: "Quarantine", icon: "shield", test: (t) => t.thread_key === "QUARANTINE" },
];

export const decisionsOf = (r: TriageResult, t: ThreadFacts) =>
  r.decisions.filter((d) => d.thread_key === t.thread_key).sort((a, b) => t.email_ids.indexOf(a.email_id) - t.email_ids.indexOf(b.email_id));

const RANK: Record<NextActionKind, number> = { escalate: 0, review: 1, reply: 2, watch: 3, archive: 4 };
const URG: Record<Urgency, number> = { high: 0, medium: 1, low: 2, "n/a": 3 };

/** Most urgent first: escalations, then items to review, then replies; high urgency before low. */
export function sortThreads(r: TriageResult, threads: ThreadFacts[]) {
  const top = (t: ThreadFacts) => Math.min(...decisionsOf(r, t).map((d) => URG[d.urgency]));
  return [...threads].sort((a, b) => RANK[a.next_action.kind] - RANK[b.next_action.kind] || top(a) - top(b));
}

export function topUrgency(ds: Decision[]): Urgency {
  return ds.reduce<Urgency>((u, d) => (URG[d.urgency] < URG[u] ? d.urgency : u), "n/a");
}

/** Age buckets used by ops inboxes (0–1, 2–5, 6–15, 16+ days). */
export function ageBucket(days: number | null): { label: string; tone: string } {
  if (days === null) return { label: "age ?", tone: "bg-slate-100 text-slate-600" };
  if (days <= 1) return { label: "0–1 days", tone: "bg-emerald-100 text-emerald-800" };
  if (days <= 5) return { label: "2–5 days", tone: "bg-sky-100 text-sky-800" };
  if (days <= 15) return { label: "6–15 days", tone: "bg-amber-100 text-amber-800" };
  return { label: "16+ days", tone: "bg-rose-100 text-rose-800" };
}

export const ACTION_STYLE: Record<NextActionKind, { bar: string; pill: string; icon: string }> = {
  escalate: { bar: "bg-rose-500", pill: "bg-rose-50 text-rose-700 ring-rose-200", icon: "escalate" },
  review: { bar: "bg-amber-400", pill: "bg-amber-50 text-amber-800 ring-amber-200", icon: "review" },
  reply: { bar: "bg-indigo-500", pill: "bg-indigo-50 text-indigo-700 ring-indigo-200", icon: "reply" },
  watch: { bar: "bg-sky-400", pill: "bg-sky-50 text-sky-700 ring-sky-200", icon: "eye" },
  archive: { bar: "bg-slate-300", pill: "bg-slate-100 text-slate-600 ring-slate-200", icon: "archive" },
};
