import * as chrono from "chrono-node";
import type { ThreadFacts } from "../types.js";
import { formatDate } from "../extract/dates.js";
import { LINT_RULES, allowedDates } from "./lint.js";

/** One-click edit for a draft, shown as an Accept / Dismiss card. `apply` never adds a claim the thread does not support. */
export interface DraftSuggestion {
  id: string;
  kind: "fix" | "improve";
  title: string;
  before: string; // text that changes ("" when adding)
  after: string; // replacement ("" when removing)
  apply: (body: string) => string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The whole sentence around [start, end), so removals do not leave fragments. */
function sentenceAround(body: string, start: number, end: number) {
  let s = start;
  while (s > 0 && !/[.!?\n]/.test(body[s - 1])) s--;
  let e = end;
  while (e < body.length && !/[.!?\n]/.test(body[e])) e++;
  if (e < body.length && /[.!?]/.test(body[e])) e++;
  while (s < start && /\s/.test(body[s])) s++;
  return { s, e, text: body.slice(s, e) };
}

const tidy = (b: string) => b.replace(/[ \t]{2,}/g, " ").replace(/ +([.,;])/g, "$1").replace(/\n{3,}/g, "\n\n");

export function suggestFixes(body: string, t: ThreadFacts): DraftSuggestion[] {
  const out: DraftSuggestion[] = [];
  const allowed = allowedDates(t);
  const agreed = t.latest_due ?? t.watch_date ?? null;

  // Dates that are not the agreed one (e.g. the superseded 18 October) → the agreed date.
  const ref = new Date(`${allowed[0] ?? t.due_history[0]?.date ?? "2026-10-16"}T12:00:00Z`);
  for (const p of chrono.parse(body, ref)) {
    const ymd = `${p.start.get("year")}-${pad(p.start.get("month")!)}-${pad(p.start.get("day")!)}`;
    if (allowed.includes(ymd) || !agreed) continue;
    const at = p.index;
    const to = formatDate(agreed);
    out.push({ id: `date-${at}`, kind: "fix", title: "Use the agreed date", before: p.text, after: to, apply: (b) => (b.slice(at, at + p.text.length) === p.text ? b.slice(0, at) + to + b.slice(at + p.text.length) : b) });
  }

  // Unsupported claims (attachment, sent, payment, approval, delivery promise) → remove the sentence.
  // A claimed attachment is rewritten honestly instead of silently dropped.
  const seen = new Set<string>();
  for (const r of LINT_RULES) {
    if (r.allowedIf?.(t)) continue;
    const m = r.pattern.exec(body);
    if (!m) continue;
    const { text } = sentenceAround(body, m.index, m.index + m[0].length);
    if (seen.has(text)) continue;
    seen.add(text);
    const honest = r.term === "attachment" || r.term === "received the file" ? (t.attachment_claimed ? "You mentioned a file; it is not verified on our side yet." : "") : "";
    out.push({
      id: `claim-${r.term}`,
      kind: "fix",
      title: honest ? "Do not confirm an unverified file" : `Remove the ${r.term === "sent" ? "'sent'" : r.term} claim`,
      before: text,
      after: honest,
      apply: (b) => tidy(b.replace(text, honest)),
    });
  }

  // Helpful additions grounded in the thread facts.
  const closing = (b: string, line: string) => {
    const i = b.lastIndexOf("\n\nRegards");
    return i >= 0 ? `${b.slice(0, i)} ${line}${b.slice(i)}` : `${b.trimEnd()} ${line}`;
  };
  for (const r of t.references) {
    if (body.includes(r)) continue;
    const line = `This is already tracked as ${r}, so no new ticket is needed.`;
    out.push({ id: `ref-${r}`, kind: "improve", title: `Mention the existing ticket ${r}`, before: "", after: line, apply: (b) => closing(b, line) });
  }
  if (t.owner === null && t.status !== "closed" && !/\bown(er|s|ing)?\b/i.test(body)) {
    const line = "Could you confirm who should own this?";
    out.push({ id: "ask-owner", kind: "improve", title: "Ask who owns it", before: "", after: line, apply: (b) => closing(b, line) });
  }
  if (t.latest_due && t.status !== "closed" && !body.includes(formatDate(t.latest_due)) && !out.some((s) => s.id.startsWith("date-"))) {
    const line = `The current deadline is ${formatDate(t.latest_due)}.`;
    out.push({ id: "state-due", kind: "improve", title: "State the current deadline", before: "", after: line, apply: (b) => closing(b, line) });
  }
  return out;
}
