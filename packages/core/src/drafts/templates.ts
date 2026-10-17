import type { DraftTone, ThreadFacts } from "../types.js";
import { formatDate } from "../extract/dates.js";

// Grounded templates: every variable part comes from ThreadFacts. No template may mention
// attachments, payments, approvals, sending, or any date other than the current agreed one.
// A tone changes the greeting, the opener and the sign-off; the factual sentences are shared, so no
// tone can add or drop a fact.

export const TONES: { id: DraftTone; label: string; hint: string }[] = [
  { id: "standard", label: "Standard", hint: "clear and neutral" },
  { id: "formal", label: "Formal", hint: "for clients and senior stakeholders" },
  { id: "friendly", label: "Friendly", hint: "for colleagues" },
  { id: "brief", label: "Brief", hint: "facts only, for busy readers" },
];

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One reply, split so tones can vary the framing without touching the facts. */
interface Parts {
  open: [standard: string, formal: string, friendly: string];
  body: string[];
  short?: string[]; // brief tone: the facts in fewer words
  ask?: string;
}

const FRAME: Record<DraftTone, { hello: string; bye: string }> = {
  standard: { hello: "Hi,", bye: "Regards" },
  formal: { hello: "Hello,", bye: "Kind regards" },
  friendly: { hello: "Hi there,", bye: "Thanks!" },
  brief: { hello: "Hi,", bye: "Thanks" },
};

function render(p: Parts, tone: DraftTone): string {
  const open = tone === "brief" ? "" : p.open[tone === "formal" ? 1 : tone === "friendly" ? 2 : 0];
  const body = tone === "brief" && p.short ? p.short : p.body;
  const text = [open, ...body, p.ask ?? ""].filter(Boolean).join(" ");
  return [FRAME[tone].hello, "", text, "", FRAME[tone].bye].join("\n");
}

function request(t: ThreadFacts): Parts {
  const corrected = t.due_history.some((h) => h.from_correction && !h.superseded_by);
  const due = t.latest_due ? `, due ${formatDate(t.latest_due)}` : "";
  return {
    open: ["Thanks for the update.", "Thank you for the update.", "Thanks so much for the update!"],
    body: [
      `The work to ${t.task} is with ${t.owner}${due}.`,
      corrected ? "This reflects your corrected deadline." : "",
      ...t.constraints.map((c) => `Noted: ${lowerFirst(c)}.`),
      t.duplicate_count ? "Your repeated request is merged into this one, so it is tracked once." : "",
    ].filter(Boolean),
    short: [`${upperFirst(t.task!)}: ${t.owner}${due}${corrected ? " (corrected date)" : ""}.`, ...t.constraints.map((c) => `${upperFirst(c)}.`)],
  };
}

function noOwner(t: ThreadFacts): Parts {
  const ref = t.references.length ? `, and it is already tracked as ${t.references.join(", ")}, so we will not open a new ticket` : "";
  return {
    open: ["Thanks for flagging this.", "Thank you for raising this.", "Thanks for flagging this!"],
    body: [`The work to ${t.task} has no confirmed owner yet${ref}.`],
    short: [`Still needs an owner: ${t.task}${t.references.length ? ` (tracked as ${t.references.join(", ")}, no new ticket)` : ""}.`],
    ask: "Could you confirm who should own it?",
  };
}

function blocker(t: ThreadFacts): Parts {
  return {
    open: [`Thanks for letting us know about the blocker: ${t.task}.`, `Thank you for letting us know about the blocker: ${t.task}.`, `Thanks for the heads-up on the blocker: ${t.task}.`],
    body: [],
    short: [`Noted the blocker: ${t.task}.`],
    ask: "Could you tell us what is needed to unblock it, or who can provide it?",
  };
}

function question(t: ThreadFacts): Parts {
  const about = t.clarify.length ? ` about the ${t.clarify.join(" and ")}` : "";
  return {
    open: [`Thanks for your question${about}.`, `Thank you for your question${about}.`, `Thanks for asking${about}!`],
    body: ["We are confirming the details and will reply in this thread."],
    short: [`Confirming the ${t.clarify.length ? t.clarify.join(" and ") : "details"}; we will reply in this thread.`],
  };
}

function resolutionAck(t: ThreadFacts, hadBlocker: boolean): Parts {
  const what = !t.task ? "this is resolved" : hadBlocker ? `the blocker (${t.task}) is resolved` : `the work to ${t.task} is done`;
  return {
    open: [`Thanks for confirming that ${what}.`, `Thank you for confirming that ${what}.`, `Great news, thanks for confirming that ${what}!`],
    body: [t.attachment_claimed ? "You mentioned a file; it is not verified on our side yet." : ""].filter(Boolean),
    short: [`Noted: ${what}.`, t.attachment_claimed ? "The file you mentioned is not verified on our side yet." : ""].filter(Boolean),
  };
}

function commitmentAck(t: ThreadFacts, commitment: string | undefined): Parts {
  const when = t.watch_date ? ` on ${formatDate(t.watch_date)}` : "";
  const will = commitment ? `you will ${commitment}${when}` : "";
  return {
    open: will ? [`Thanks, noted that ${will}.`, `Thank you; noted that ${will}.`, `Thanks, sounds good: ${will}.`] : ["Thanks, noted.", "Thank you, noted.", "Thanks, noted!"],
    body: [],
    short: [will ? `Noted: ${will}.` : "Noted."],
  };
}

export interface TemplateContext {
  commitment?: string; // what the sender said they will do
  hadBlocker: boolean;
}

function parts(t: ThreadFacts, ctx: TemplateContext): Parts | null {
  if (t.draft_mode === "none") return null;
  if (t.draft_mode === "ack") return t.status === "closed" ? resolutionAck(t, ctx.hadBlocker) : commitmentAck(t, ctx.commitment);
  if (t.status === "blocked") return blocker(t);
  if (t.task && t.owner === null) return noOwner(t);
  if (t.task && t.owner) return request(t);
  if (t.clarify.length) return question(t);
  return { open: ["Thanks for your message.", "Thank you for your message.", "Thanks for your message!"], body: ["We are reviewing it and will reply in this thread."], short: ["Reviewing this; we will reply in this thread."] };
}

/** Template draft for a thread in a tone, or null when the thread must not get a reply. */
export function draftInTone(t: ThreadFacts, ctx: TemplateContext, tone: DraftTone): string | null {
  const p = parts(t, ctx);
  return p && render(p, tone);
}

/** The default (standard tone) draft. */
export function templateDraft(t: ThreadFacts, ctx: TemplateContext): string | null {
  return draftInTone(t, ctx, "standard");
}
