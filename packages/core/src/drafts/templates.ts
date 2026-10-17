import type { ThreadFacts } from "../types.js";
import { formatDate } from "../extract/dates.js";

// Grounded templates: every variable part comes from ThreadFacts. No template may mention
// attachments, payments, approvals, sending, or any date other than the current agreed one.

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const wrap = (lines: string[]) => ["Hi,", "", lines.filter(Boolean).join(" "), "", "Regards"].join("\n");

function request(t: ThreadFacts): string {
  const corrected = t.due_history.some((h) => h.from_correction && !h.superseded_by);
  return wrap([
    `Thanks for the update. The work to ${t.task} is with ${t.owner}${t.latest_due ? `, due ${formatDate(t.latest_due)}` : ""}.`,
    corrected ? "This reflects your corrected deadline." : "",
    ...t.constraints.map((c) => `Noted: ${lowerFirst(c)}.`),
    t.duplicate_count ? "Your repeated request is merged into this one, so it is tracked once." : "",
  ]);
}

function noOwner(t: ThreadFacts): string {
  const ref = t.references.length ? `, and it is already tracked as ${t.references.join(", ")}, so we will not open a new ticket` : "";
  return wrap([`Thanks for flagging this. The work to ${t.task} has no confirmed owner yet${ref}.`, "Could you confirm who should own it?"]);
}

function blocker(t: ThreadFacts): string {
  return wrap([`Thanks for letting us know about the blocker: ${t.task}.`, "Could you tell us what is needed to unblock it, or who can provide it?"]);
}

function question(t: ThreadFacts): string {
  const about = t.clarify.length ? ` about the ${t.clarify.join(" and ")}` : "";
  return wrap([`Thanks for your question${about}.`, "We are confirming the details and will reply in this thread."]);
}

function resolutionAck(t: ThreadFacts, hadBlocker: boolean): string {
  const what = !t.task ? "this is resolved" : hadBlocker ? `the blocker (${t.task}) is resolved` : `the work to ${t.task} is done`;
  return wrap([`Thanks for confirming that ${what}.`, t.attachment_claimed ? "You mentioned a file; it is not verified on our side yet." : ""]);
}

function commitmentAck(t: ThreadFacts, commitment: string | undefined): string {
  const when = t.watch_date ? ` on ${formatDate(t.watch_date)}` : "";
  return wrap([commitment ? `Thanks, noted that you will ${commitment}${when}.` : "Thanks, noted."]);
}

export interface TemplateContext {
  commitment?: string; // what the sender said they will do
  hadBlocker: boolean;
}

/** Template draft for a thread, or null when the thread must not get a reply. */
export function templateDraft(t: ThreadFacts, ctx: TemplateContext): string | null {
  if (t.draft_mode === "none") return null;
  if (t.draft_mode === "ack") return t.status === "closed" ? resolutionAck(t, ctx.hadBlocker) : commitmentAck(t, ctx.commitment);
  if (t.status === "blocked") return blocker(t);
  if (t.task && t.owner === null) return noOwner(t);
  if (t.task && t.owner) return request(t);
  if (t.clarify.length) return question(t);
  return wrap(["Thanks for your message. We are reviewing it and will reply in this thread."]);
}
