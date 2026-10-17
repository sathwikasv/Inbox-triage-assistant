import { lintDraft } from "../drafts/lint.js";
import { needsApproval } from "../drafts/review.js";
import type { Address, CalendarEvent, Category, MailAccount, MailboxState, MailboxView, MailMessage, ReplyDraft, TaskItem, MailTaskStatus as TaskStatus } from "./types.js";
import { addMinutes, toIso, zoneOffset } from "./time.js";

// Every change a person makes is a pure function of the state, with an audit entry. Email content never
// reaches these functions as instructions: they take explicit arguments chosen in the UI.

export class ActionError extends Error {
  constructor(
    message: string,
    public readonly reasons: string[] = [],
  ) {
    super(message);
    this.name = "ActionError";
  }
}

export type Role = "viewer" | "reviewer" | "approver";

const log = (s: MailboxState, actor: string, at: string, type: string, target: string, detail: string): MailboxState => ({ ...s, audit: [...s.audit, { at, actor, type, target, detail }] });
const need = (cond: unknown, msg: string): void => {
  if (!cond) throw new ActionError(msg);
};

export function setCategory(s: MailboxState, messageId: string, category: Category | null, actor: string, at: string): MailboxState {
  const categories = { ...s.categories };
  if (category) categories[messageId] = category;
  else delete categories[messageId];
  return log({ ...s, categories }, actor, at, "category", messageId, category ? `category set to ${category}` : "category reset to the assistant's suggestion");
}

export const setRead = (s: MailboxState, messageId: string, read: boolean): MailboxState => ({ ...s, read: { ...s.read, [messageId]: read } });

export function setStarred(s: MailboxState, messageId: string, starred: boolean, actor: string, at: string): MailboxState {
  return log({ ...s, starred: { ...s.starred, [messageId]: starred } }, actor, at, "star", messageId, starred ? "marked important" : "unmarked important");
}

/** Archive is a workspace view change; it never deletes mail. */
export function archiveThread(s: MailboxState, threadKey: string, archived: boolean, actor: string, at: string): MailboxState {
  return log({ ...s, archived: { ...s.archived, [threadKey]: archived } }, actor, at, archived ? "archive" : "unarchive", threadKey, archived ? "archived in this workspace; nothing was deleted" : "moved back to the inbox");
}

export function updateTask(s: MailboxState, id: string, patch: { status?: TaskStatus; confirmed?: boolean; title?: string; due_date?: string; due_time?: string | null; dismissed?: boolean }, actor: string, at: string): MailboxState {
  if (patch.due_date !== undefined) need(/^\d{4}-\d{2}-\d{2}$/.test(patch.due_date), "due date must be YYYY-MM-DD");
  if (patch.due_time) need(/^\d{2}:\d{2}$/.test(patch.due_time), "due time must be HH:MM");
  if (patch.title !== undefined) need(patch.title.trim().length > 0, "a task needs a title");
  const tasks = { ...s.tasks, [id]: { ...s.tasks[id], ...patch } };
  const what = patch.dismissed ? "dismissed" : patch.confirmed ? "added to tasks" : patch.status ? `status ${patch.status}` : "edited";
  return log({ ...s, tasks }, actor, at, "task", id, what);
}

export function addManualTask(s: MailboxState, t: { title: string; due_date?: string; due_time?: string | null; owner?: string | null; timezone: string; source?: TaskItem["source"] }, actor: string, at: string): MailboxState {
  need(t.title.trim(), "a task needs a title");
  if (t.due_date) need(/^\d{4}-\d{2}-\d{2}$/.test(t.due_date), "due date must be YYYY-MM-DD");
  const id = `task:manual:${s.manual_tasks.length + 1}:${Date.parse(at)}`;
  const task: TaskItem = {
    id,
    title: t.title.trim(),
    owner: t.owner ?? null,
    due: t.due_date ? { date: t.due_date, time: t.due_time ?? null, end_time: null, tz_offset: zoneOffset(t.timezone, new Date(at)), tz_source: "user", text: "set by you", needs_confirmation: [] } : null,
    due_note: null,
    priority: "normal",
    status: "pending",
    overdue: false,
    source: t.source ?? { message_id: "", thread_key: "", quote: "" },
    suggested_follow_up: null,
    origin: "manual",
    confirmed: true,
  };
  return log({ ...s, manual_tasks: [...s.manual_tasks, task] }, actor, at, "task", id, "created");
}

/**
 * Creates a calendar event from a proposal, only with a person's confirmation. A date is required; a time is
 * required unless the person chooses an all-day event. The person may edit every field first.
 */
export function acceptProposal(
  view: MailboxView,
  s: MailboxState,
  id: string,
  edits: { title?: string; date?: string; time?: string | null; duration_min?: number; all_day?: boolean; reminders_min?: number[]; location?: string | null },
  calendar: CalendarEvent["calendar"],
  actor: string,
  at: string,
): { state: MailboxState; event: CalendarEvent } {
  const p = view.proposals.find((x) => x.id === id);
  need(p, `no proposal ${id}`);
  need(p!.kind !== "cancellation", "a cancellation does not create an event; remove the event from your calendar instead");
  const date = edits.date ?? p!.when?.date;
  const allDay = edits.all_day ?? false;
  const time = edits.time !== undefined ? edits.time : p!.when?.time ?? null;
  if (!date) throw new ActionError("confirm the date first: the email does not give one", ["no date"]);
  need(/^\d{4}-\d{2}-\d{2}$/.test(date), "date must be YYYY-MM-DD");
  if (!allDay && !time) throw new ActionError("confirm a start time, or make it an all-day event", ["no time"]);
  if (time) need(/^\d{2}:\d{2}$/.test(time), "time must be HH:MM");
  const offset = edits.time !== undefined || edits.date !== undefined ? zoneOffset(view.user.timezone, new Date(`${date}T12:00:00Z`)) : (p!.when?.tz_offset ?? zoneOffset(view.user.timezone));
  const duration = edits.duration_min ?? p!.duration_min ?? 30;
  need(duration > 0 && duration <= 24 * 60, "duration must be between 1 minute and 24 hours");
  const start = toIso(date, allDay ? "00:00" : time, offset);
  const event: CalendarEvent = {
    id: `cal:${id}`,
    title: (edits.title ?? p!.title).trim() || p!.title,
    start,
    end: allDay ? addMinutes(start, 24 * 60) : addMinutes(start, duration),
    all_day: allDay,
    location: edits.location !== undefined ? edits.location : p!.location,
    link: p!.link,
    participants: p!.participants,
    reminders_min: edits.reminders_min ?? [15],
    source_message_id: p!.source.message_id,
    calendar,
    simulated: calendar === "demo",
  };
  const events = [...s.events.filter((e) => e.id !== event.id), event];
  const next = { ...s, events, proposals: { ...s.proposals, [id]: { status: "accepted" as const, event_id: event.id } } };
  return { state: log(next, actor, at, "event_create", event.id, `${event.title} on ${date}${allDay ? " (all day)" : ` at ${time}`} in the ${calendar} calendar${event.simulated ? " (demo, simulated)" : ""}`), event };
}

export function rejectProposal(s: MailboxState, id: string, actor: string, at: string): MailboxState {
  return log({ ...s, proposals: { ...s.proposals, [id]: { status: "rejected" } } }, actor, at, "event_reject", id, "proposal declined; nothing added to the calendar");
}

export function removeEvent(s: MailboxState, eventId: string, actor: string, at: string): MailboxState {
  const e = s.events.find((x) => x.id === eventId);
  need(e, `no event ${eventId}`);
  const proposals = Object.fromEntries(Object.entries(s.proposals).filter(([, v]) => v.event_id !== eventId));
  return log({ ...s, events: s.events.filter((x) => x.id !== eventId), proposals }, actor, at, "event_remove", eventId, `${e!.title} removed`);
}

export function setEventReminders(s: MailboxState, eventId: string, reminders_min: number[], actor: string, at: string): MailboxState {
  need(reminders_min.every((m) => Number.isInteger(m) && m >= 0 && m <= 7 * 24 * 60), "reminders are minutes before the start, up to a week");
  return log({ ...s, events: s.events.map((e) => (e.id === eventId ? { ...e, reminders_min } : e)) }, actor, at, "reminder", eventId, `reminders ${reminders_min.join(", ") || "none"} minutes before`);
}

export function addReminder(s: MailboxState, target: { kind: "task" | "event"; id: string }, atIso: string, note: string, actor: string, at: string): MailboxState {
  need(!Number.isNaN(Date.parse(atIso)), "reminder time is not a valid date");
  const r = { id: `rem:${s.reminders.length + 1}:${Date.parse(at)}`, target, at: atIso, note: note.trim() || "Reminder", done: false };
  return log({ ...s, reminders: [...s.reminders, r] }, actor, at, "reminder", target.id, `reminder at ${atIso}`);
}

export const completeReminder = (s: MailboxState, id: string): MailboxState => ({ ...s, reminders: s.reminders.map((r) => (r.id === id ? { ...r, done: true } : r)) });

export function setFollowUp(s: MailboxState, id: string, status: "done" | "dismissed" | "snoozed" | "open", until: string | undefined, actor: string, at: string): MailboxState {
  if (status === "snoozed") need(until && !Number.isNaN(Date.parse(until)), "snooze needs a date");
  const followups = { ...s.followups };
  if (status === "open") delete followups[id];
  else followups[id] = { status, until };
  return log({ ...s, followups }, actor, at, "followup", id, status === "snoozed" ? `snoozed until ${until}` : status);
}

/** Dates the conversation itself proposes (meeting slots), which a reply may repeat. */
export function proposedDates(view: MailboxView, threadKey: string): string[] {
  return view.proposals.filter((p) => p.source.thread_key === threadKey && p.when).map((p) => p.when!.date);
}

export function lintReply(view: MailboxView, threadKey: string, body: string) {
  const th = view.threads.find((t) => t.key === threadKey);
  if (!th?.facts) return { ok: true, violations: [] };
  return lintDraft(body, th.facts, { dates: proposedDates(view, threadKey) });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function saveReplyDraft(view: MailboxView, s: MailboxState, d: Omit<ReplyDraft, "saved_at" | "approved_at" | "sent_at" | "sent_simulated">, actor: string, at: string): MailboxState {
  const th = view.threads.find((t) => t.key === d.thread_key);
  need(th, `no conversation ${d.thread_key}`);
  need(th!.category !== "spam", "replies to suspicious mail are blocked");
  need(d.to.length > 0, "add at least one recipient");
  for (const a of [...d.to, ...d.cc]) need(EMAIL.test(a.email), `"${a.email}" is not an email address`);
  need(d.body.trim(), "the reply is empty");
  const lint = lintReply(view, d.thread_key, d.body);
  if (!lint.ok) throw new ActionError("the reply makes claims the conversation does not support", lint.violations.map((v) => `"${v.term}": ${v.reason}`));
  const prev = s.drafts[d.thread_key];
  const changed = !prev || prev.body !== d.body || JSON.stringify(prev.to) !== JSON.stringify(d.to) || JSON.stringify(prev.cc) !== JSON.stringify(d.cc) || prev.subject !== d.subject;
  const draft: ReplyDraft = { ...d, saved_at: at, approved_at: changed ? null : (prev?.approved_at ?? null), sent_at: null, sent_simulated: false };
  return log({ ...s, drafts: { ...s.drafts, [d.thread_key]: draft } }, actor, at, "draft_save", d.thread_key, `reply saved (${d.tone}, ${d.source})${changed && prev?.approved_at ? "; previous approval withdrawn" : ""}`);
}

export function discardReplyDraft(s: MailboxState, threadKey: string, actor: string, at: string): MailboxState {
  const drafts = { ...s.drafts };
  delete drafts[threadKey];
  return log({ ...s, drafts }, actor, at, "draft_discard", threadKey, "draft discarded");
}

/** Wording that makes a send consequential: the person must confirm each one explicitly. */
export function sendRisks(body: string): string[] {
  const r: string[] = [];
  if (/\b(pay|paid|payment|invoice|refund|transfer|bank|amount|₹|rs\.?|inr|\$|usd)\b/i.test(body)) r.push("mentions payments or money");
  if (/\b(contract|agreement|legal|liability|terms|nda|lawsuit|compliance|gdpr)\b/i.test(body)) r.push("mentions legal or contractual terms");
  if (/\b(password|otp|account number|aadhaar|pan|ssn|salary|medical|personal data|confidential)\b/i.test(body)) r.push("mentions sensitive or personal information");
  if (/\b(we|i) will\b|\bwe'll\b|\bi'll\b|\bguarantee\b|\bpromise\b|\bcommit\b/i.test(body)) r.push("makes a commitment on your behalf");
  return r;
}

/**
 * Whether a reply may go out now, and what must be confirmed first. Sending is never automatic: it always
 * needs a saved, lint-clean draft, an Approver for consequential replies, and an explicit confirmation.
 */
export function sendCheck(view: MailboxView, s: MailboxState, threadKey: string, role: Role): { ok: boolean; blockers: string[]; confirm: string[]; simulated: boolean } {
  const d = s.drafts[threadKey];
  const th = view.threads.find((t) => t.key === threadKey);
  const acc = view.accounts.find((a) => a.id === th?.account_id);
  const blockers: string[] = [];
  if (!th) blockers.push("unknown conversation");
  if (!d) blockers.push("save the reply first");
  if (role === "viewer") blockers.push("viewers cannot send");
  if (th?.category === "spam") blockers.push("replies to suspicious mail are blocked");
  if (d?.sent_at) blockers.push("already sent");
  if (acc?.mode === "connected" && !acc.send_enabled) blockers.push(`sending is turned off for ${acc.address}; turn it on in Connected accounts`);
  if (acc?.mode === "connected" && acc.status !== "ok") blockers.push(`${acc.address} is not connected (${acc.status})`);
  if (d && th?.facts) {
    const lint = lintReply(view, threadKey, d.body);
    if (!lint.ok) blockers.push("the reply fails the claims check");
    const gate = needsApproval(d.body, th.facts);
    if (gate.needed && !d.approved_at) blockers.push(`needs Approver sign-off: ${gate.reasons.join(", ")}`);
  }
  if (acc?.mode === "import") blockers.push("imported files cannot send; connect the mailbox to reply from it");
  return { ok: blockers.length === 0, blockers, confirm: d ? sendRisks(d.body) : [], simulated: acc?.mode !== "connected" };
}

export function approveReplyDraft(s: MailboxState, threadKey: string, role: Role, actor: string, at: string): MailboxState {
  need(role === "approver", "only an Approver can sign off replies");
  const d = s.drafts[threadKey];
  need(d, "save the reply first");
  return log({ ...s, drafts: { ...s.drafts, [threadKey]: { ...d!, approved_at: at } } }, actor, at, "draft_approve", threadKey, "reply approved; it is still not sent");
}

/**
 * Records a reply as sent. In demo mode the message is simulated and labelled as such. In connected mode the
 * caller (the API) has already sent it through the provider and passes the provider's message id.
 */
export function recordSent(view: MailboxView, s: MailboxState, threadKey: string, role: Role, confirmed: string[], actor: string, at: string, provider?: { message_id: string }): { state: MailboxState; message: MailMessage } {
  const check = sendCheck(view, s, threadKey, role);
  if (!check.ok) throw new ActionError("this reply cannot be sent yet", check.blockers);
  const missing = check.confirm.filter((c) => !confirmed.includes(c));
  if (missing.length) throw new ActionError("confirm the sensitive content before sending", missing);
  if (!check.simulated && !provider) throw new ActionError("connected sends must go through the mail provider");
  const d = s.drafts[threadKey]!;
  const acc = view.accounts.find((a) => a.id === view.threads.find((t) => t.key === threadKey)!.account_id)!;
  const message: MailMessage = {
    id: `out:${threadKey}:${Date.parse(at)}`,
    account_id: acc.id,
    provider_message_id: provider?.message_id,
    thread_id: view.messages.find((m) => m.id === d.in_reply_to)?.thread_id,
    in_reply_to: d.in_reply_to,
    from: { name: view.user.name, email: acc.address },
    to: d.to,
    cc: d.cc,
    subject: d.subject,
    body: d.body,
    received_at: at,
    direction: "outbound",
    read: true,
    starred: false,
    attachments: [],
    simulated: check.simulated,
  };
  const drafts = { ...s.drafts, [threadKey]: { ...d, sent_at: at, sent_simulated: check.simulated } };
  const next = { ...s, drafts, outbox: [...s.outbox, message] };
  const to = d.to.map((a: Address) => a.email).join(", ");
  return { state: log(next, actor, at, "send", threadKey, check.simulated ? `simulated send to ${to} (demo mode: no email left the app)` : `sent through ${acc.provider} to ${to}`), message };
}

export type { MailAccount };
