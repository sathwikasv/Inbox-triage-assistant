import * as chrono from "chrono-node";
import type { LintViolation, ThreadFacts } from "../types.js";
import { formatDate } from "../extract/dates.js";

type Rule = { term: string; pattern: RegExp; reason: string; allowedIf?: (t: ThreadFacts) => boolean };

// Forbidden commitments (Check 2). A draft may only state what the thread's extracted facts support.
export const LINT_RULES: Rule[] = [
  {
    term: "attachment",
    pattern: /\battach(ed|ment|ments|ing)?\b/i,
    reason: "claims an attachment; attachments are never verified in this tool",
    allowedIf: (t) => t.attachment_verified,
  },
  {
    term: "received the file",
    pattern: /\b(received|got|downloaded|opened|reviewed|checked)\s+(the|your)\s+(\w+\s+)?(file|document|attachment|report|data)\b/i,
    reason: "claims we received or checked a file; the claim in the thread is unverified",
    allowedIf: (t) => t.attachment_verified,
  },
  {
    term: "sent",
    pattern: /\b(i|we)('ve|\s+have)?\s+sent\b|\bsent\s+(you|it|this|the)\b|\bhas been sent\b|\bforwarded (it|this|the|you)\b/i,
    reason: "draft-only tool: nothing has been sent",
  },
  {
    term: "payment",
    pattern: /\b(payments?|paid|pay|refunds?|refunded|reimburs\w*)\b|\binvoice (is |has been )?(settled|cleared)\b/i,
    reason: "no payment facts in this thread",
  },
  {
    term: "approved",
    pattern: /\bapprov(e|ed|al)\b/i,
    reason: "no approval in this thread's facts",
  },
  {
    term: "delivery promise",
    pattern: /\b(we|i)('ll|\s+will|\s+shall)\s+(deliver|ship|complete|finish|fix|resolve)\b[^.]*\b(by|before|on)\b/i,
    reason: "promises delivery by a date; only the owner's agreed deadline may be stated",
  },
];

const RELATIVE = /\b(today|tomorrow|tonight|next|this (week|month)|in \d+ days?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const pad = (n: number) => String(n).padStart(2, "0");

/** Dates the draft may state: the current agreed deadline and the sender's own commitment date. */
export function allowedDates(t: ThreadFacts): string[] {
  return [t.latest_due, t.watch_date].filter((d): d is string => !!d);
}

/**
 * Lints a draft against the thread's facts. `extra.dates` admits dates the thread's own emails propose
 * (a meeting time someone asked for), so a scheduling reply can name the slot it answers.
 */
export function lintDraft(body: string, t: ThreadFacts, extra: { dates?: string[] } = {}): { ok: boolean; violations: LintViolation[] } {
  const violations: LintViolation[] = [];
  for (const r of LINT_RULES) {
    const m = r.pattern.exec(body);
    if (m && !(r.allowedIf?.(t) ?? false)) violations.push({ term: m[0], reason: r.reason });
  }

  const allowed = [...allowedDates(t), ...(extra.dates ?? [])];
  const ref = new Date(`${allowed[0] ?? t.due_history[0]?.date ?? "2026-10-16"}T12:00:00Z`);
  for (const p of chrono.parse(body, ref)) {
    if (RELATIVE.test(p.text)) {
      violations.push({ term: p.text, reason: "relative date in a draft; write the exact agreed date" });
      continue;
    }
    const ymd = `${p.start.get("year")}-${pad(p.start.get("month")!)}-${pad(p.start.get("day")!)}`;
    if (allowed.includes(ymd)) continue;
    const old = t.due_history.find((h) => h.date === ymd && h.superseded_by);
    violations.push({
      term: p.text,
      reason: old
        ? `${formatDate(ymd)} was superseded by ${old.superseded_by}; the agreed date is ${t.latest_due ? formatDate(t.latest_due) : "not set"}`
        : `${formatDate(ymd)} is not a date in this thread's facts`,
    });
  }
  return { ok: violations.length === 0, violations };
}
