import { runTriage } from "../pipeline.js";
import { POLICY } from "../policy.js";
import { splitQuoted } from "../normalize.js";
import { extractDates, formatDate } from "../extract/dates.js";
import { cleanSubject } from "../threading.js";
import { SPOOFED_URGENCY } from "../classify.js";
import type { AiPrediction, Decision, Draft, ThreadFacts, TriageResult } from "../types.js";
import type {
  Address,
  CalendarEvent,
  Category,
  EventProposal,
  FollowUp,
  MailAccount,
  MailboxData,
  MailboxState,
  MailboxUser,
  MailboxView,
  MailMessage,
  MailThread,
  MessageInsight,
  Priority,
  TaskItem,
  WhenSpec,
} from "./types.js";
import { detectDuration, detectLocation, detectMeetingLink, detectPhishing, detectPromotion, detectScheduling, detectVagueDeadline } from "./detect.js";
import { addMinutes, dayIn, toIso, whenFrom, zoneOffset } from "./time.js";

export const EMPTY_STATE: MailboxState = {
  categories: {},
  read: {},
  starred: {},
  archived: {},
  tasks: {},
  manual_tasks: [],
  proposals: {},
  events: [],
  followups: {},
  reminders: [],
  drafts: {},
  outbox: [],
  audit: [],
};

export const CATEGORY_LABEL: Record<Category, string> = {
  urgent: "Urgent",
  requires_action: "Requires action",
  to_delegate: "To delegate",
  meetings: "Meetings and scheduling",
  waiting: "Waiting for response",
  important: "Important",
  follow_up: "Follow-up required",
  fyi: "FYI",
  promotions: "Promotions and newsletters",
  spam: "Spam or suspicious",
};

// Most pressing first; a thread shows the most pressing category among its emails.
const PRESSING: Category[] = ["urgent", "meetings", "requires_action", "to_delegate", "follow_up", "waiting", "important", "fyi", "promotions", "spam"];
const RANK: Record<Priority, number> = { critical: 0, high: 1, normal: 2, low: 3 };
const ACTION_PURPOSES = new Set(["request", "correction", "question", "blocker"]);

const lower = (s: string) => s.trim().toLowerCase();
const DAY = 86_400_000;

export function isMine(a: Address, user: MailboxUser) {
  return user.addresses.map(lower).includes(lower(a.email));
}

function ownerIsUser(owner: string, user: MailboxUser) {
  const first = lower(user.name).split(/\s+/)[0];
  return lower(owner) === lower(user.name) || lower(owner) === first || ["me", "you"].includes(lower(owner));
}

const nameOf = (a: Address) => a.name || a.email;
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function triageAccount(inbound: MailMessage[], ai?: Record<string, AiPrediction>): TriageResult | null {
  if (!inbound.length) return null;
  const emails = inbound.map((m) => ({ email_id: m.id, subject: m.subject, body: m.body.trim() || "(empty message)", received_at: m.received_at, ...(m.thread_id ? { thread_id: m.thread_id } : {}) }));
  return runTriage({ case_id: "C16", records: { emails, policy: { ...POLICY } } }, { ai });
}

interface Ctx {
  user: MailboxUser;
  state: MailboxState;
  now: string;
}

function insightFor(m: MailMessage, d: Decision, t: ThreadFacts, ctx: Ctx, key: string): MessageInsight {
  const { fresh, quoted } = splitQuoted(m.body);
  const phishing = detectPhishing(m);
  const promo = detectPromotion(m);
  const sched = detectScheduling(m.subject, fresh, m.attachments.some((a) => /\.ics$/i.test(a.name)));
  const starred = ctx.state.starred[m.id] ?? m.starred;
  const flags: MessageInsight["flags"] = [];
  if (quoted) flags.push("quoted_history_ignored");
  if (d.explain.urgency === SPOOFED_URGENCY) flags.push("spoofed_urgency");
  if (d.facts.some((f) => f.kind === "attachment_claim")) flags.push("attachment_unverified");
  if (d.review?.needed) flags.push("needs_review");

  let category: Category;
  let reason: string;
  let next: string;
  const injection = d.purpose === "injection";
  if (injection) {
    category = "spam";
    reason = `Instruction-like content (${d.explain.purpose}). Quarantined: it cannot change permissions or trigger actions.`;
    next = "Do not act on it; a person reviews it";
  } else if (phishing.length) {
    category = "spam";
    reason = `Looks like phishing: ${phishing.join("; ")}.`;
    next = "Do not reply or click links; report it";
  } else if (promo && !ACTION_PURPOSES.has(d.purpose)) {
    category = "promotions";
    reason = `Newsletter or promotion: ${promo}. Not spam.`;
    next = "Read later; nothing is asked of you";
  } else if (t.status === "closed" && d.purpose !== "request") {
    category = "fyi";
    reason = d.purpose === "resolution" ? `Resolution: ${d.explain.purpose}.` : "Resolved later in this conversation.";
    next = t.suppress_chaser ? "No action: resolved, do not chase" : "No action: resolved";
  } else if (sched) {
    category = "meetings";
    reason = `Scheduling: "${sched.quote}".`;
    next = sched.kind === "cancellation" ? "Confirm the cancellation in your calendar" : "Review the proposed time, then accept, edit or decline";
  } else if (d.urgency === "high" && d.action_needed) {
    category = "urgent";
    reason = `${upperFirst(d.purpose.replace("_", " "))}: ${d.explain.urgency}.`;
    next = t.next_action.label || "Reply";
  } else if (d.action_needed && t.owner && !ownerIsUser(t.owner, ctx.user)) {
    category = "to_delegate";
    reason = `Work assigned to ${t.owner}: ${d.explain.purpose}.`;
    next = `Track with ${t.owner}`;
  } else if (d.action_needed) {
    category = "requires_action";
    reason = `${upperFirst(d.purpose.replace("_", " "))}: ${d.explain.purpose}.`;
    next = d.purpose === "question" ? "Answer the question" : t.next_action.label || "Reply";
  } else if (d.purpose === "commitment") {
    category = "waiting";
    reason = `The sender committed to act: ${d.explain.purpose}.`;
    next = t.watch_date ? `Wait for ${nameOf(m.from)} until ${formatDate(t.watch_date)}` : `Wait for ${nameOf(m.from)}`;
  } else if (d.purpose === "duplicate") {
    category = "follow_up";
    reason = `A repeat request: ${d.explain.purpose}. The sender is waiting.`;
    next = "Reply in the original conversation";
  } else if (starred) {
    category = "important";
    reason = "You starred this email.";
    next = "Review";
  } else {
    category = "fyi";
    reason = `${d.purpose === "status_update" ? "Progress update" : "Informational"}: ${d.explain.purpose}.`;
    next = "No action needed";
  }

  // A detector (phishing, promotion, scheduling) decided the category, so "no type rule matched" is not a doubt.
  if (phishing.length || category === "promotions" || category === "meetings") flags.splice(0, flags.length, ...flags.filter((x) => x !== "needs_review"));

  const secondary = new Set<Category>();
  if (category !== "to_delegate" && d.action_needed && t.owner === null) secondary.add("to_delegate");
  if (starred && category !== "important") secondary.add("important");
  if (sched && category !== "meetings" && category !== "spam") secondary.add("meetings");
  if (t.duplicate_count > 0 && category !== "follow_up" && !["fyi", "spam"].includes(category)) secondary.add("follow_up");

  let priority: Priority = "low";
  if (category === "urgent") priority = t.escalations.some((e) => e.severity === "high") || t.status === "blocked" ? "critical" : "high";
  else if (category === "meetings") priority = "high";
  else if (["requires_action", "to_delegate", "follow_up", "waiting", "important"].includes(category)) priority = "normal";

  const override = ctx.state.categories[m.id];
  const decided_by = override ? "user" : d.ai?.decided_by === "ai" ? "ai" : "rules";
  if (override && override !== category) {
    reason = `You set this to ${CATEGORY_LABEL[override]} (the assistant suggested ${CATEGORY_LABEL[category]}: ${reason})`;
    category = override;
    if (override === "spam" || override === "promotions" || override === "fyi") priority = "low";
    else if (override === "urgent") priority = priority === "critical" ? "critical" : "high";
    else if (priority === "low") priority = "normal";
  }

  return { message_id: m.id, thread_key: key, category, secondary: [...secondary], priority, reason, next_action: next, purpose: d.purpose, urgency: d.urgency, decided_by, suspicious: injection || phishing.length > 0, flags };
}

/** The due date of a thread's task with its time and zone, read from the sentence that set it. */
function dueOf(t: ThreadFacts, decisions: Map<string, Decision>, messages: Map<string, MailMessage>, user: MailboxUser): WhenSpec | null {
  const entry = t.due_history.find((h) => !h.superseded_by);
  if (!entry) return null;
  const msg = messages.get(entry.email_id);
  if (!msg) return null;
  const m = extractDates(entry.quote, msg.received_at).find((x) => x.date === entry.date) ?? { date: entry.date, text: formatDate(entry.date), sentence: entry.quote, cue: "due" as const, time: null, end_time: null, tz_offset: null };
  const w = whenFrom(m, msg.received_at, user.timezone);
  if (w && t.due_history.some((h) => h.superseded_by)) w.needs_confirmation = w.needs_confirmation.filter((n) => n !== "no time given");
  void decisions;
  return w;
}

function whenInstant(w: WhenSpec): string {
  return toIso(w.date, w.time ?? "23:59", w.tz_offset);
}

function overlaps(a: { start: string; end: string }, b: { start: string; end: string }) {
  return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
}

/** The full mailbox view: categories, threads, tasks, meeting proposals and follow-ups, with a person's choices applied. */
export function buildMailboxView(data: MailboxData, state: MailboxState = EMPTY_STATE, opts: { now?: string; ai?: Record<string, AiPrediction> } = {}): MailboxView {
  const now = opts.now ?? data.demo_clock ?? new Date().toISOString();
  const ctx: Ctx = { user: data.user, state, now };
  const all = [...data.messages, ...state.outbox];
  const byId = new Map(all.map((m) => [m.id, m]));
  const insights: Record<string, MessageInsight> = {};
  const decisions: Record<string, Decision> = {};
  const factsByKey = new Map<string, ThreadFacts>();
  const draftByKey = new Map<string, Draft>();
  const keyOfMessage = new Map<string, string>();

  for (const acc of data.accounts) {
    const own = all.filter((m) => m.account_id === acc.id);
    const inbound = own.filter((m) => m.direction === "inbound");
    const r = triageAccount(inbound, opts.ai);
    if (r) {
      for (const t of r.threads) factsByKey.set(`${acc.id}:${t.thread_key}`, t);
      for (const d of r.drafts) draftByKey.set(`${acc.id}:${d.thread_key}`, d);
      for (const d of r.decisions) {
        const key = `${acc.id}:${d.thread_key}`;
        keyOfMessage.set(d.email_id, key);
        decisions[d.email_id] = d;
      }
      for (const d of r.decisions) insights[d.email_id] = insightFor(byId.get(d.email_id)!, d, factsByKey.get(keyOfMessage.get(d.email_id)!)!, ctx, keyOfMessage.get(d.email_id)!);
    }
    // Outbound mail joins the conversation it answers.
    for (const m of own.filter((x) => x.direction === "outbound")) {
      const key = (m.in_reply_to && keyOfMessage.get(m.in_reply_to)) || (m.thread_id ? `${acc.id}:T-${m.thread_id}` : `${acc.id}:T-out-${m.id}`);
      keyOfMessage.set(m.id, key);
    }
  }

  // Threads
  const groups = new Map<string, MailMessage[]>();
  for (const m of all) {
    const key = keyOfMessage.get(m.id);
    if (key) groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const threads: MailThread[] = [...groups.entries()].map(([key, list]) => {
    list.sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at));
    const inbound = list.filter((m) => m.direction === "inbound");
    const ins = inbound.map((m) => insights[m.id]).filter(Boolean);
    const last0 = list.at(-1)!;
    const category: Category = ins.some((i) => i.category === "spam") ? "spam" : (PRESSING.find((c) => ins.some((i) => i.category === c)) ?? (last0.direction === "outbound" ? "waiting" : "fyi"));
    const priority = ins.reduce<Priority>((p, i) => (RANK[i.priority] < RANK[p] ? i.priority : p), "low");
    const last = list.at(-1)!;
    const facts = factsByKey.get(key) ?? null;
    return {
      key,
      account_id: last.account_id,
      subject: facts?.title && facts.title !== "(no subject)" && !last.thread_id ? facts.title : cleanSubject(list[0].subject),
      message_ids: list.map((m) => m.id),
      facts,
      draft: draftByKey.get(key) ?? null,
      last_at: last.received_at,
      last_direction: last.direction,
      unread: inbound.filter((m) => !(state.read[m.id] ?? m.read)).length,
      category,
      priority,
      archived: !!state.archived[key],
    };
  });
  threads.sort((a, b) => Date.parse(b.last_at) - Date.parse(a.last_at));
  const threadOf = new Map(threads.map((t) => [t.key, t]));

  // Tasks: one per thread that carries work, a suggestion until a person adds it.
  const tasks: TaskItem[] = [];
  for (const th of threads) {
    const t = th.facts;
    if (!t?.task || th.category === "spam" || th.category === "promotions") continue;
    const id = `task:${th.key}`;
    const s = state.tasks[id];
    if (s?.dismissed) continue;
    const sourceDecision = th.message_ids.map((mid) => decisions[mid]).find((d) => d?.facts.some((f) => f.kind === "task"));
    if (!sourceDecision) continue;
    const sourceMsg = byId.get(sourceDecision.email_id)!;
    let due = dueOf(t, new Map(Object.entries(decisions)), byId, data.user);
    if (s?.due_date) due = { date: s.due_date, time: s.due_time ?? null, end_time: null, tz_offset: zoneOffset(data.user.timezone, new Date(now)), tz_source: "user", text: "set by you", needs_confirmation: [] };
    const fresh = splitQuoted(sourceMsg.body).fresh;
    const vague = due ? null : detectVagueDeadline(fresh);
    let title = upperFirst(t.task);
    if (due || vague) title = title.replace(/\s+(by|before|no later than|due)\s+[^,;]*$/i, "");
    const status = s?.status ?? (t.status === "closed" ? "completed" : t.status === "in_progress" ? "in_progress" : "pending");
    const overdue = !!due && status !== "completed" && Date.parse(whenInstant(due)) < Date.parse(now);
    const follow = due ? dayIn(addMinutes(whenInstant(due), -24 * 60), due.tz_offset) : dayIn(new Date(Date.parse(sourceMsg.received_at) + 2 * DAY).toISOString(), zoneOffset(data.user.timezone));
    tasks.push({
      id,
      title: s?.title ?? title,
      owner: t.owner ?? null,
      due,
      due_note: vague ? `"${vague}" is not a date; confirm when it is due` : null,
      priority: overdue ? "critical" : th.priority,
      status,
      overdue,
      source: { message_id: sourceMsg.id, thread_key: th.key, quote: sourceDecision.facts.find((f) => f.kind === "task")!.evidence.quote },
      suggested_follow_up: follow,
      origin: "extracted",
      confirmed: s?.confirmed ?? false,
    });
  }
  for (const mt of state.manual_tasks) {
    const s = state.tasks[mt.id];
    if (s?.dismissed) continue;
    const status = s?.status ?? mt.status;
    tasks.push({ ...mt, status, overdue: !!mt.due && status !== "completed" && Date.parse(whenInstant(mt.due)) < Date.parse(now) });
  }

  // Meeting proposals: the latest scheduling email per conversation.
  const proposals: EventProposal[] = [];
  for (const th of threads) {
    if (th.category === "spam") continue;
    const sched = [...th.message_ids]
      .reverse()
      .map((mid) => byId.get(mid)!)
      .filter((m) => m.direction === "inbound")
      .map((m) => ({ m, s: detectScheduling(m.subject, splitQuoted(m.body).fresh, m.attachments.some((a) => /\.ics$/i.test(a.name))) }))
      .find((x) => x.s);
    if (!sched) continue;
    const { m, s } = sched;
    const fresh = splitQuoted(m.body).fresh;
    const mentions = extractDates(`${fresh}`, m.received_at);
    const pick = mentions.find((x) => x.time) ?? mentions.find((x) => x.date);
    const when = pick ? whenFrom(pick, m.received_at, data.user.timezone) : null;
    let duration = detectDuration(fresh);
    if (!duration && when?.time && when.end_time) {
      const [h1, m1] = when.time.split(":").map(Number);
      const [h2, m2] = when.end_time.split(":").map(Number);
      duration = h2 * 60 + m2 - (h1 * 60 + m1);
    }
    const id = `evt:${th.key}`;
    const st = state.proposals[id];
    const participants = [m.from, ...m.to, ...m.cc].filter((a, i, arr) => !isMine(a, data.user) && arr.findIndex((b) => lower(b.email) === lower(a.email)) === i);
    const conflicts: string[] = [];
    if (when?.time) {
      const start = toIso(when.date, when.time, when.tz_offset);
      const slot = { start, end: addMinutes(start, duration ?? 30) };
      for (const e of state.events) if (e.id !== st?.event_id && !e.all_day && overlaps(slot, e)) conflicts.push(e.title);
    }
    proposals.push({
      id,
      kind: s!.kind,
      title: s!.kind === "cancellation" ? `Cancelled: ${cleanSubject(m.subject)}` : cleanSubject(m.subject),
      when: when ?? null,
      duration_min: duration,
      participants,
      location: detectLocation(fresh),
      link: detectMeetingLink(m.body),
      source: { message_id: m.id, thread_key: th.key, quote: s!.quote },
      status: st?.status ?? "proposed",
      conflicts,
    });
  }

  // Follow-ups
  const followups: FollowUp[] = [];
  const push = (f: Omit<FollowUp, "status" | "snoozed_until">) => {
    const st = state.followups[f.id];
    const snoozed = st?.status === "snoozed" && st.until && Date.parse(st.until) > Date.parse(now);
    followups.push({ ...f, status: st ? (st.status === "snoozed" ? (snoozed ? "snoozed" : "open") : st.status) : "open", snoozed_until: snoozed ? st!.until! : null });
  };
  const age = (iso: string) => (Date.parse(now) - Date.parse(iso)) / DAY;
  for (const th of threads) {
    if (th.archived || th.category === "spam" || th.category === "promotions") continue;
    const last = byId.get(th.message_ids.at(-1)!)!;
    const draft = state.drafts[th.key];
    if (last.direction === "inbound" && ["urgent", "requires_action", "meetings", "follow_up", "to_delegate"].includes(th.category) && !draft?.sent_at && age(last.received_at) >= 1) {
      const days = Math.floor(age(last.received_at));
      push({ id: `fu:unreplied:${th.key}`, kind: "unreplied", title: th.subject, reason: `No reply to ${nameOf(last.from)} for ${days} day${days === 1 ? "" : "s"}`, message_id: last.id, thread_key: th.key, due: new Date(Date.parse(last.received_at) + DAY).toISOString() });
    }
    if (last.direction === "outbound" && age(last.received_at) >= 2) {
      const days = Math.floor(age(last.received_at));
      push({ id: `fu:waiting:${th.key}`, kind: "waiting_on_them", title: th.subject, reason: `You wrote to ${last.to.map(nameOf).join(", ")} ${days} days ago; no reply yet`, message_id: last.id, thread_key: th.key, due: new Date(Date.parse(last.received_at) + 2 * DAY).toISOString() });
    }
    if (th.facts?.watch_date && th.facts.status !== "closed") {
      const commit = th.message_ids.map((mid) => decisions[mid]).find((d) => d?.purpose === "commitment");
      const fact = commit?.facts.find((f) => f.kind === "commitment");
      if (commit && fact) push({ id: `fu:they:${th.key}`, kind: "they_promised", title: th.subject, reason: `${nameOf(byId.get(commit.email_id)!.from)} said they ${fact.value.replace(/^sender /, "")} by ${formatDate(th.facts.watch_date)}`, message_id: commit.email_id, thread_key: th.key, due: toIso(th.facts.watch_date, "18:00", zoneOffset(data.user.timezone)) });
    }
    for (const mid of th.message_ids) {
      const m = byId.get(mid)!;
      if (m.direction !== "outbound") continue;
      const sentence = /[^.!?\n]*\b(i|we)('ll| will| shall)\b[^.!?\n]*/i.exec(m.body)?.[0]?.trim();
      const when = sentence ? extractDates(sentence, m.received_at).find((x) => x.date) : undefined;
      if (sentence && when?.date) push({ id: `fu:we:${m.id}`, kind: "we_promised", title: th.subject, reason: `You promised: "${sentence}"`, message_id: m.id, thread_key: th.key, due: toIso(when.date, when.time ?? "17:00", when.tz_offset ?? zoneOffset(data.user.timezone)) });
    }
  }
  for (const t of tasks) {
    if (t.status === "completed" || !t.due) continue;
    const dueAt = whenInstant(t.due);
    const left = (Date.parse(dueAt) - Date.parse(now)) / DAY;
    if (t.overdue) push({ id: `fu:overdue:${t.id}`, kind: "overdue", title: t.title, reason: `Overdue since ${formatDate(t.due.date)}${t.due.time ? ` ${t.due.time}` : ""}`, message_id: t.source.message_id, thread_key: t.source.thread_key, due: dueAt });
    else if (left <= 2) push({ id: `fu:soon:${t.id}`, kind: "deadline_soon", title: t.title, reason: `Due ${formatDate(t.due.date)}${t.due.time ? ` at ${t.due.time}` : ""}${t.owner ? ` (owner ${t.owner})` : ""}`, message_id: t.source.message_id, thread_key: t.source.thread_key, due: dueAt });
  }
  followups.sort((a, b) => Date.parse(a.due ?? now) - Date.parse(b.due ?? now));

  // Counts (inbound mail that is not archived)
  const counts = { all: 0, unread: 0 } as MailboxView["counts"];
  for (const c of PRESSING) counts[c] = 0;
  for (const [mid, ins] of Object.entries(insights)) {
    const th = threadOf.get(ins.thread_key);
    if (th?.archived) continue;
    counts.all++;
    counts[ins.category]++;
    const m = byId.get(mid)!;
    if (!(state.read[mid] ?? m.read)) counts.unread++;
  }

  return {
    now,
    user: data.user,
    accounts: data.accounts,
    messages: all,
    insights,
    decisions,
    threads,
    tasks,
    proposals,
    events: [...state.events].sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
    followups,
    reminders: state.reminders,
    counts,
  };
}

/** Reply recipients for a thread: the sender of the email being answered, the rest of its recipients on CC. */
export function replyHeaders(view: MailboxView, threadKey: string, account?: MailAccount): { to: Address[]; cc: Address[]; subject: string; in_reply_to: string } | null {
  const th = view.threads.find((t) => t.key === threadKey);
  if (!th) return null;
  const targetId = th.draft?.reply_to?.email_id ?? [...th.message_ids].reverse().find((id) => view.messages.find((m) => m.id === id)?.direction === "inbound");
  const target = view.messages.find((m) => m.id === targetId);
  if (!target) return null;
  const me = (a: Address) => isMine(a, view.user) || (account ? lower(a.email) === lower(account.address) : false);
  const cc = [...target.to, ...target.cc].filter((a, i, arr) => !me(a) && lower(a.email) !== lower(target.from.email) && arr.findIndex((b) => lower(b.email) === lower(a.email)) === i);
  const subject = /^re:/i.test(target.subject) ? target.subject : `Re: ${target.subject}`;
  return { to: [target.from], cc, subject, in_reply_to: target.id };
}

export type { CalendarEvent };
