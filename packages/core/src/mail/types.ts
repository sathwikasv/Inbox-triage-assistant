import type { Decision, Draft, Purpose, ThreadFacts, Urgency } from "../types.js";

// The unified mailbox: several accounts (Gmail, Outlook, Yahoo), each either a clearly labelled
// demo account or a connected one. Email content is untrusted input everywhere.

export type Provider = "gmail" | "outlook" | "yahoo";
export type AccountMode = "demo" | "connected";

export interface MailAccount {
  id: string;
  provider: Provider;
  address: string;
  display_name: string;
  mode: AccountMode;
  status: "ok" | "syncing" | "error" | "disconnected" | "not_configured";
  last_sync_at: string | null;
  error?: string;
  /** Off by default. Even when on, every send needs a person's review and confirmation; auto_send is never possible. */
  send_enabled: boolean;
}

export interface Address {
  name?: string;
  email: string;
}

export interface Attachment {
  name: string;
  size_kb?: number;
}

export interface MailMessage {
  id: string;
  account_id: string;
  provider_message_id?: string;
  thread_id?: string; // provider conversation id; absent for imported files, which are threaded by content
  in_reply_to?: string; // message id this one answers (outbound replies)
  from: Address;
  to: Address[];
  cc: Address[];
  subject: string;
  body: string; // plain text
  received_at: string; // ISO 8601 with offset
  direction: "inbound" | "outbound";
  read: boolean;
  starred: boolean;
  attachments: Attachment[];
  list_unsubscribe?: boolean; // the List-Unsubscribe header was present
  labels?: string[];
  simulated?: boolean; // created by a demo action, never by a provider
}

export interface MailboxUser {
  name: string;
  addresses: string[];
  timezone: string; // IANA, e.g. "Asia/Kolkata"
}

export type Category = "urgent" | "requires_action" | "to_delegate" | "meetings" | "waiting" | "important" | "follow_up" | "fyi" | "promotions" | "spam";
export type Priority = "critical" | "high" | "normal" | "low";

export interface MessageInsight {
  message_id: string;
  thread_key: string;
  category: Category;
  secondary: Category[];
  priority: Priority;
  reason: string;
  next_action: string;
  purpose: Purpose;
  urgency: Urgency;
  decided_by: "rules" | "ai" | "user";
  suspicious: boolean;
  flags: ("quoted_history_ignored" | "spoofed_urgency" | "attachment_unverified" | "needs_review")[];
}

/** A date/time read from an email, with what still needs a person to confirm. */
export interface WhenSpec {
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM, null for all-day
  end_time: string | null;
  tz_offset: number; // minutes east of UTC used to interpret the time
  tz_source: "stated" | "sender" | "user";
  text: string; // the words from the email
  needs_confirmation: string[]; // e.g. "no time given", "sender's timezone differs from yours"
}

export type MailTaskStatus = "pending" | "in_progress" | "completed";

export interface TaskItem {
  id: string;
  title: string;
  owner: string | null;
  due: WhenSpec | null;
  due_note: string | null; // vague deadline that could not be dated ("end of day", "soon")
  priority: Priority;
  status: MailTaskStatus;
  overdue: boolean;
  source: { message_id: string; thread_key: string; quote: string };
  suggested_follow_up: string | null; // YYYY-MM-DD
  origin: "extracted" | "manual";
  confirmed: boolean; // a person added it to the task list
}

export type EventKind = "meeting_request" | "invitation" | "confirmation" | "reschedule" | "cancellation";

export interface EventProposal {
  id: string;
  kind: EventKind;
  title: string;
  when: WhenSpec | null;
  duration_min: number | null;
  participants: Address[];
  location: string | null;
  link: string | null;
  source: { message_id: string; thread_key: string; quote: string };
  status: "proposed" | "accepted" | "rejected";
  conflicts: string[]; // titles of calendar events that overlap
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO with offset
  end: string;
  all_day: boolean;
  location: string | null;
  link: string | null;
  participants: Address[];
  reminders_min: number[]; // minutes before start
  source_message_id: string | null;
  calendar: "demo" | "google" | "outlook";
  simulated: boolean;
}

export type FollowUpKind = "unreplied" | "waiting_on_them" | "they_promised" | "we_promised" | "deadline_soon" | "overdue";

export interface FollowUp {
  id: string;
  kind: FollowUpKind;
  title: string;
  reason: string;
  message_id: string;
  thread_key: string;
  due: string | null; // ISO
  status: "open" | "done" | "dismissed" | "snoozed";
  snoozed_until: string | null;
}

export interface Reminder {
  id: string;
  target: { kind: "task" | "event"; id: string };
  at: string; // ISO
  note: string;
  done: boolean;
}

/** Everything a person decided; the analysis is recomputed from messages + this state. */
export interface MailboxState {
  categories: Record<string, Category>; // message id → user override
  read: Record<string, boolean>;
  starred: Record<string, boolean>;
  archived: Record<string, boolean>; // thread key → archived (only ever after a person chose it)
  tasks: Record<string, { status?: MailTaskStatus; confirmed?: boolean; dismissed?: boolean; title?: string; due_date?: string; due_time?: string | null }>;
  manual_tasks: TaskItem[];
  proposals: Record<string, { status: "accepted" | "rejected"; event_id?: string }>;
  events: CalendarEvent[];
  followups: Record<string, { status: "done" | "dismissed" | "snoozed"; until?: string }>;
  reminders: Reminder[];
  drafts: Record<string, ReplyDraft>; // thread key → reviewed draft
  outbox: MailMessage[]; // replies a person sent (simulated in demo mode, recorded after the provider accepted them in connected mode)
  audit: MailAuditEvent[];
}

export interface ReplyDraft {
  thread_key: string;
  account_id: string;
  in_reply_to: string; // message id
  to: Address[];
  cc: Address[];
  subject: string;
  body: string;
  tone: "standard" | "formal" | "friendly" | "brief";
  source: "template" | "ai" | "edited";
  saved_at: string;
  approved_at: string | null;
  sent_at: string | null;
  sent_simulated: boolean;
}

export interface MailAuditEvent {
  at: string;
  actor: string;
  type: string;
  target: string;
  detail: string;
}

export interface MailboxData {
  user: MailboxUser;
  accounts: MailAccount[];
  messages: MailMessage[];
  demo_clock?: string; // demo data is pinned to this "now" so dates stay meaningful
}

export interface MailThread {
  key: string; // account-scoped: "<account_id>:<thread key>"
  account_id: string;
  subject: string;
  message_ids: string[]; // time order, inbound and outbound
  facts: ThreadFacts | null; // from the triage engine (inbound mail only)
  draft: Draft | null;
  last_at: string;
  last_direction: "inbound" | "outbound";
  unread: number;
  category: Category;
  priority: Priority;
  archived: boolean;
}

export interface MailboxView {
  now: string;
  user: MailboxUser;
  accounts: MailAccount[];
  messages: MailMessage[];
  insights: Record<string, MessageInsight>; // inbound message id → insight
  decisions: Record<string, Decision>; // inbound message id → engine decision (evidence, facts)
  threads: MailThread[];
  tasks: TaskItem[];
  proposals: EventProposal[];
  events: CalendarEvent[];
  followups: FollowUp[];
  reminders: Reminder[];
  counts: Record<Category | "unread" | "all", number>;
}
