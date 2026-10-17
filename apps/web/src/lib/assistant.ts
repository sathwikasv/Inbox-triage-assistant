import { formatDate, type Decision, type ThreadFacts } from "@c16/core";
import { formatReceived } from "./format";

/** Questions the thread assistant can answer. Answers are built only from extracted facts and cite their emails. */
export const QUESTIONS = [
  { id: "summary", label: "Summarize this thread" },
  { id: "needed", label: "What's needed from me?" },
  { id: "changed", label: "What changed?" },
  { id: "urgency", label: "Why this urgency?" },
  { id: "risks", label: "Anything risky?" },
] as const;

export type QuestionId = (typeof QUESTIONS)[number]["id"];
export interface Answer {
  lines: string[];
  cites: string[];
}

const label = (p: string) => p.replace("_", " ");

export function answer(q: QuestionId, t: ThreadFacts, ds: Decision[]): Answer {
  const cites = new Set<string>();
  const cite = (id?: string) => id && cites.add(id);
  const lines: string[] = [];

  if (q === "summary") {
    if (t.task) lines.push(`Task: ${t.task}.`);
    if (t.owner) lines.push(`Owner: ${t.owner}.`);
    else if (t.owner === null) lines.push("No confirmed owner yet.");
    const cur = t.due_history.find((h) => !h.superseded_by);
    const old = t.due_history.filter((h) => h.superseded_by);
    if (cur) {
      lines.push(`Due ${formatDate(cur.date)}${old.length ? ` (changed from ${old.map((h) => formatDate(h.date)).join(", ")} by ${cur.email_id})` : ""}.`);
      cite(cur.email_id);
      old.forEach((h) => cite(h.email_id));
    }
    if (t.references.length) lines.push(`Already tracked as ${t.references.join(", ")}.`);
    if (t.duplicate_count) lines.push(`${t.duplicate_count} repeated request(s) merged into one.`);
    if (t.watch_date) lines.push(`The sender said they will act on ${formatDate(t.watch_date)}.`);
    lines.push(`Status: ${label(t.status)}.`);
    ds.forEach((d) => cite(d.email_id));
  }

  if (q === "needed") {
    lines.push(`${t.next_action.label}: ${t.next_action.reason}.`);
    for (const e of t.escalations) lines.push(`Escalation (${e.severity}): ${e.reason}.`);
    if (t.draft_mode !== "none") lines.push("A reply draft is ready for review; it is never sent automatically.");
    else lines.push(`No reply needed: ${t.draft_reason}.`);
    if (t.clarify.length) lines.push(`They want to know: ${t.clarify.join(", ")}.`);
  }

  if (q === "changed") {
    for (const d of ds) {
      cite(d.email_id);
      const due = d.facts.find((f) => f.kind === "due");
      const extra = due ? ` (due ${formatDate(due.value)}${due.supersedes ? `, replaces ${due.supersedes.join(", ")}` : ""}${due.superseded_by ? `, later replaced by ${due.superseded_by}` : ""})` : "";
      lines.push(`${formatReceived(d.received_at)} · ${d.email_id}: ${label(d.purpose)}${extra} → ${label(d.status)}`);
    }
  }

  if (q === "urgency") {
    for (const d of ds) {
      cite(d.email_id);
      lines.push(`${d.email_id} is ${d.urgency === "n/a" ? "not ranked" : `${d.urgency} urgency`}: ${d.explain.urgency}.`);
    }
  }

  if (q === "risks") {
    const inj = ds.filter((d) => d.purpose === "injection");
    if (inj.length) lines.push(`${inj.map((d) => d.email_id).join(", ")} contains instructions aimed at the assistant. It is quarantined, and the policy stays draft-only.`);
    if (t.attachment_claimed) lines.push("A file is mentioned but cannot be verified; the draft must not say it was received.");
    for (const l of t.inferred_links) lines.push(`${l.email_id} was linked by inference (${l.rule}); please confirm.`);
    for (const d of ds.filter((x) => x.review?.needed)) lines.push(`${d.email_id}: ${d.review.reason}.`);
    if (!lines.length) lines.push("Nothing risky found: no injection, no unverified attachment, no uncertain links.");
    [...inj, ...ds.filter((x) => x.review?.needed)].forEach((d) => cite(d.email_id));
  }

  return { lines, cites: [...cites] };
}

/** Map a free-text question to one of the fact-backed answers (Copilot ask box). */
export function routeQuestion(text: string): QuestionId {
  const q = text.toLowerCase();
  if (/risk|safe|inject|suspicious|attach|verify|trust/.test(q)) return "risks";
  if (/why|urgent|urgency|priority|important/.test(q)) return "urgency";
  if (/chang|history|timeline|correct|happen/.test(q)) return "changed";
  if (/need|do i|should i|next|action|todo|to do|escalat|owner|who/.test(q)) return "needed";
  return "summary";
}
