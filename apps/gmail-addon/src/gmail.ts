import { BUCKETS, TYPE_LABEL, TYPES, cleanBody, type Bucket, type MailType } from "./logic";

export const LABEL_ROOT = "Triage";
export const LABEL_DRAFT = "Triage/Draft ready";
export const LABEL_ARCHIVE = "Triage/Archive suggested";
export const LABEL_DONE = "Triage/Processed";
const typeLabel = (t: MailType) => `Triage/Type/${TYPE_LABEL[t]}`;

export function parseFrom(raw: string): { name: string; email: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  return m ? { name: m[1].trim(), email: m[2].trim().toLowerCase() } : { name: "", email: raw.trim().toLowerCase() };
}

export const me = () => Session.getEffectiveUser().getEmail();

/** ISO timestamp with the script's offset (the rules engine needs an explicit offset). */
export function iso(d: Date | GoogleAppsScript.Base.Date): string {
  return Utilities.formatDate(new Date(d.getTime()), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX");
}

export interface LoadedMessage {
  msg: GoogleAppsScript.Gmail.GmailMessage;
  thread: GoogleAppsScript.Gmail.GmailThread;
  id: string;
  from: { name: string; email: string };
  replyTo: string | null;
  subject: string;
  body: string; // cleaned: no quoted history or signature
  date: Date;
  auth: string | null;
  links: number;
  hasUnsubscribe: boolean;
  earlier: GoogleAppsScript.Gmail.GmailMessage[]; // earlier messages in the same thread
  senderRecent: { date: string; subject: string; snippet: string }[];
  prior: number; // earlier messages from this sender (outside this thread)
  replied: number; // sent threads to this sender
}

export function loadMessage(messageId: string): LoadedMessage {
  const msg = GmailApp.getMessageById(messageId);
  const thread = msg.getThread();
  const from = parseFrom(msg.getFrom());
  const date = new Date(msg.getDate().getTime());
  const earlier = thread.getMessages().filter((m) => m.getId() !== messageId && m.getDate().getTime() <= date.getTime());
  const history = from.email ? GmailApp.search(`from:${from.email}`, 0, 15).filter((t) => t.getId() !== thread.getId()) : [];
  const senderRecent = history.slice(0, 5).map((t) => {
    const m = t.getMessages().filter((x) => parseFrom(x.getFrom()).email === from.email).pop() ?? t.getMessages()[0];
    return { date: iso(m.getDate()), subject: m.getSubject(), snippet: cleanBody(m.getPlainBody()).slice(0, 200) };
  });
  const replied = from.email ? GmailApp.search(`in:sent to:${from.email}`, 0, 5).length : 0;
  const header = (h: string) => {
    try {
      return msg.getHeader(h) || null;
    } catch {
      return null;
    }
  };
  return {
    msg,
    thread,
    id: messageId,
    from,
    replyTo: msg.getReplyTo() || null,
    subject: msg.getSubject(),
    body: cleanBody(msg.getPlainBody()),
    date,
    auth: header("Authentication-Results"),
    links: (msg.getBody().match(/href=/gi) ?? []).length,
    hasUnsubscribe: !!header("List-Unsubscribe"),
    earlier,
    senderRecent,
    prior: history.length,
    replied,
  };
}

/* ---------------- Labels ---------------- */

function labelSpecs(): { name: string; bg?: string; fg?: string; hidden?: boolean }[] {
  return [
    { name: LABEL_ROOT },
    ...(Object.keys(BUCKETS) as Bucket[]).map((b) => ({ name: BUCKETS[b].label, bg: BUCKETS[b].bg, fg: BUCKETS[b].fg })),
    { name: "Triage/Type" },
    ...TYPES.map((t) => ({ name: typeLabel(t), bg: "#cccccc", fg: "#000000" })),
    { name: LABEL_DRAFT, bg: "#4a86e8", fg: "#ffffff" },
    { name: LABEL_ARCHIVE, bg: "#efefef", fg: "#666666" },
    { name: LABEL_DONE, hidden: true },
  ];
}

/** Create the Triage labels once, with colours from Gmail's palette (falls back to no colour). */
export function ensureLabels() {
  const existing = new Set((Gmail.Users!.Labels!.list("me").labels ?? []).map((l) => l.name));
  for (const s of labelSpecs()) {
    if (existing.has(s.name)) continue;
    const base = { name: s.name, labelListVisibility: s.hidden ? "labelHide" : "labelShow", messageListVisibility: s.hidden ? "hide" : "show" };
    try {
      Gmail.Users!.Labels!.create(s.bg ? { ...base, color: { backgroundColor: s.bg, textColor: s.fg } } : base, "me");
    } catch {
      Gmail.Users!.Labels!.create(base, "me");
    }
  }
}

const label = (name: string) => GmailApp.getUserLabelByName(name) ?? GmailApp.createLabel(name);

/** One bucket label and one type label per thread; the previous ones are replaced. */
export function applyTriageLabels(thread: GoogleAppsScript.Gmail.GmailThread, bucket: Bucket, type: MailType, archiveSuggested: boolean) {
  for (const b of Object.keys(BUCKETS) as Bucket[]) if (b !== bucket) GmailApp.getUserLabelByName(BUCKETS[b].label)?.removeFromThread(thread);
  for (const t of TYPES) if (t !== type) GmailApp.getUserLabelByName(typeLabel(t))?.removeFromThread(thread);
  label(BUCKETS[bucket].label).addToThread(thread);
  label(typeLabel(type)).addToThread(thread);
  const arch = GmailApp.getUserLabelByName(LABEL_ARCHIVE);
  if (archiveSuggested) label(LABEL_ARCHIVE).addToThread(thread);
  else arch?.removeFromThread(thread);
  if (bucket === "do_now" || bucket === "review") thread.getMessages().pop()?.star();
}

export function markProcessed(thread: GoogleAppsScript.Gmail.GmailThread) {
  label(LABEL_DONE).addToThread(thread);
}

/* ---------------- Drafts (never sent) ---------------- */

export function replaceDraft(msg: GoogleAppsScript.Gmail.GmailMessage, previousDraftId: string | null, body: string): string {
  if (previousDraftId) {
    try {
      GmailApp.getDraft(previousDraftId).deleteDraft();
    } catch {
      /* already sent, deleted or edited away by the user */
    }
  }
  const draft = msg.createDraftReply(body);
  label(LABEL_DRAFT).addToThread(msg.getThread());
  return draft.getId();
}
