import type { Decision, Escalation, NextAction, ThreadFacts } from "./types.js";
import { QUARANTINE } from "./threading.js";
import { formatDate } from "./extract/dates.js";

/** Whole calendar days between two ISO timestamps, each read in its own offset. */
export function daysBetween(fromIso: string, toIso: string): number {
  const day = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((day(toIso) - day(fromIso)) / 86_400_000);
}

function escalationsFor(t: ThreadFacts, ds: Decision[], asOf: string | null): Escalation[] {
  const out: Escalation[] = [];
  if (t.thread_key === QUARANTINE) return [{ code: "suspicious", severity: "high", reason: "instruction-like content; route to a person for security review" }];
  const open = t.status !== "closed";
  if (open && t.owner === null) out.push({ code: "no_owner", severity: "high", reason: "no confirmed owner; assign one before work starts" });
  if (t.status === "blocked") out.push({ code: "blocked", severity: "high", reason: `work is blocked${t.task ? `: ${t.task}` : ""}` });
  if (open && t.latest_due && asOf) {
    const left = daysBetween(asOf, t.latest_due);
    if (left < 0) out.push({ code: "overdue", severity: "high", reason: `deadline ${formatDate(t.latest_due)} has passed` });
    else if (left <= 1) out.push({ code: "due_soon", severity: "medium", reason: `due ${formatDate(t.latest_due)}, within a day` });
  }
  if (t.duplicate_count >= 2) out.push({ code: "repeated_chaser", severity: "medium", reason: `${t.duplicate_count} repeat requests; the sender is waiting` });
  return out;
}

function nextAction(t: ThreadFacts, ds: Decision[]): NextAction {
  const esc = (code: Escalation["code"]) => t.escalations.find((e) => e.code === code);
  if (t.thread_key === QUARANTINE) return { kind: "escalate", label: "Escalate for security review", reason: "suspicious instruction; never answered or archived automatically" };
  if (esc("no_owner")) return { kind: "escalate", label: "Escalate: assign an owner", reason: esc("no_owner")!.reason };
  if (esc("blocked")) return { kind: "escalate", label: "Escalate: unblock", reason: esc("blocked")!.reason };
  const doubt = ds.find((d) => d.review.needed);
  if (doubt) return { kind: "review", label: "Check the email type", reason: `${doubt.email_id}: ${doubt.review.reason}` };
  if (t.draft_mode === "reply") return { kind: "reply", label: "Reply", reason: t.draft_reason };
  if (t.status === "closed") return { kind: "archive", label: t.draft_mode === "ack" ? "Acknowledge and archive" : "Archive", reason: t.suppress_chaser ? "resolved; chaser suppressed" : "resolved" };
  if (t.watch_date) return { kind: "watch", label: `Watch until ${formatDate(t.watch_date)}`, reason: "the sender committed to act; nothing is asked of us" };
  if (t.status === "in_progress") return { kind: "watch", label: "Watch", reason: "in progress, not complete" };
  return { kind: "archive", label: "Archive", reason: t.draft_reason || "informational; nothing to do" };
}

/** Adds ages, escalation reasons and the suggested next action to every thread. */
export function route(threads: ThreadFacts[], decisions: Decision[], asOf: string | null): void {
  for (const d of decisions) d.age_days = asOf && d.received_at ? daysBetween(d.received_at, asOf) : null;
  for (const t of threads) {
    const ds = decisions.filter((d) => d.thread_key === t.thread_key);
    const times = ds.map((d) => d.received_at).filter((x): x is string => !!x).sort((a, b) => Date.parse(a) - Date.parse(b));
    t.last_activity = times.at(-1) ?? null;
    t.age_days = asOf && times[0] ? daysBetween(times[0], asOf) : null;
    t.escalations = escalationsFor(t, ds, asOf);
    t.next_action = nextAction(t, ds);
  }
}
