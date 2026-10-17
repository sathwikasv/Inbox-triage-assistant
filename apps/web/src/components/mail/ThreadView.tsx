import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  BadgeCheck,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Highlighter,
  ListTodo,
  Loader2,
  Lock,
  Mail,
  MapPin,
  MoreHorizontal,
  Reply,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Users,
  Video,
  Wand2,
} from "lucide-react";
import {
  CATEGORY_LABEL,
  TONES,
  approveReplyDraft,
  discardReplyDraft,
  formatDate,
  lintReply,
  offsetLabel,
  rejectProposal,
  replyHeaders,
  saveReplyDraft,
  sendCheck,
  setCategory,
  splitQuoted,
  updateTask,
  type Category,
  type DraftTone,
  type EventProposal,
  type MailAccount,
  type MailboxView,
  type MailMessage,
  type MailThread,
  type TaskItem,
} from "@c16/core";
import { useApp } from "../../store/app";
import { useMailbox } from "../../store/mailbox";
import { aiReply, aiStatus } from "../../lib/ai";
import { useThreadActions } from "../../lib/threadActions";
import { lastMessageId, useAssistant } from "../../store/assistant";
import { AssistantCard } from "./AssistantCard";
import { Badge, Button, Dialog, Segmented, Tip, cn } from "../../ui";
import { CAT, CATS, CategoryBadge, PriorityBadge, ProviderMark, SenderAvatar, accountNote, addrList, addrText, ago, localTime, nameOf } from "./common";

const now = () => new Date().toISOString();
const FACT_LABEL: Record<string, string> = { task: "the task", due: "the deadline", owner: "the owner", status: "the status", reference: "the tracker", blocker: "a blocker", resolution: "the resolution", attachment_claim: "an attachment claim", injection: "an instruction-like request", constraint: "a constraint", commitment: "a promise", clarify: "a question", escalation: "the escalation" };

export interface ThreadPosition {
  index: number;
  total: number;
  prev: () => void;
  next: () => void;
}

export function ThreadView({ view, thread, onBack, position, onRemoved }: { view: MailboxView; thread: MailThread; onBack: () => void; position?: ThreadPosition; onRemoved?: () => void }) {
  const { state, apply } = useMailbox();
  const { prefs, setPrefs } = useApp();
  const actor = prefs.name;
  const actions = useThreadActions(view);
  const msgs = thread.message_ids.map((id) => view.messages.find((m) => m.id === id)!);
  const acc = view.accounts.find((a) => a.id === thread.account_id)!;
  const lead = [...msgs]
    .filter((m) => m.direction === "inbound")
    .reverse()
    .map((m) => view.insights[m.id])
    .find(Boolean);
  const task = view.tasks.find((t) => t.source.thread_key === thread.key);
  const proposal = view.proposals.find((p) => p.source.thread_key === thread.key);
  const starred = msgs.some((m) => state.starred[m.id] ?? m.starred);
  const f = thread.facts;
  const meta = CAT[thread.category];
  const [open, setOpen] = useState<Set<string>>(() => new Set(msgs.length <= 2 ? msgs.map((m) => m.id) : [msgs.at(-1)!.id, ...msgs.filter((m) => m.direction === "inbound" && !(state.read[m.id] ?? m.read)).map((m) => m.id)]));
  const tb = "grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-fg/[0.08] hover:text-fg";

  return (
    <section className="flex min-h-0 min-w-0 animate-slide-in flex-col bg-surface">
      <div className="flex h-12 shrink-0 items-center gap-0.5 border-b border-line px-2">
        <Tip content="Back to the list (Esc)">
          <button onClick={onBack} aria-label="Back to the list" className={tb}>
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>
        </Tip>
        <Tip content={thread.archived ? "Move to inbox" : "Archive (e)"}>
          <button
            onClick={() => {
              actions.archive([thread.key], !thread.archived);
              onRemoved?.();
            }}
            aria-label={thread.archived ? "Unarchive" : "Archive"}
            className={tb}
          >
            {thread.archived ? <ArchiveRestore className="h-[18px] w-[18px]" /> : <Archive className="h-[18px] w-[18px]" />}
          </button>
        </Tip>
        <Tip content="Mark as unread (Shift U)">
          <button
            onClick={() => {
              actions.markRead([thread.key], false);
              onBack();
            }}
            aria-label="Mark unread"
            className={tb}
          >
            <Mail className="h-[18px] w-[18px]" />
          </button>
        </Tip>
        <Tip content={starred ? "Unstar (s)" : "Star (s)"}>
          <button onClick={() => actions.star([thread.key], !starred)} aria-label={starred ? "Unmark important" : "Mark important"} className={tb}>
            <Star className={cn("h-[18px] w-[18px]", starred && "fill-amber-400 text-amber-400")} />
          </button>
        </Tip>
        {lead && (
          <label className="ml-1 flex items-center">
            <span className="sr-only">Category</span>
            <select
              value={state.categories[lead.message_id] ?? ""}
              onChange={(e) => apply((s) => setCategory(s, lead.message_id, (e.target.value || null) as Category | null, actor, now()), "Category updated")}
              aria-label="Change category"
              className={cn("h-8 cursor-pointer rounded-full px-3 text-xs font-semibold outline-none ring-1 ring-inset", meta.chip)}
            >
              <option value="">{state.categories[lead.message_id] ? "Use the assistant's choice" : `Category: ${meta.short}`}</option>
              {CATS.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
        )}
        {position && (
          <div className="ml-auto flex items-center gap-0.5 text-xs text-muted">
            <span className="mr-1 hidden tabular-nums sm:inline">
              {position.index + 1} of {position.total}
            </span>
            <Tip content="Newer (k)">
              <button onClick={position.prev} disabled={position.index <= 0} aria-label="Previous conversation" className={cn(tb, "disabled:opacity-30")}>
                <ChevronLeft className="h-[18px] w-[18px]" />
              </button>
            </Tip>
            <Tip content="Older (j)">
              <button onClick={position.next} disabled={position.index >= position.total - 1} aria-label="Next conversation" className={cn(tb, "disabled:opacity-30")}>
                <ChevronRight className="h-[18px] w-[18px]" />
              </button>
            </Tip>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-5 lg:px-8">
          <div>
            <h1 className="text-[22px] font-normal leading-snug tracking-tight">{thread.subject}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <CategoryBadge category={thread.category} full />
              <PriorityBadge priority={thread.priority} />
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-subtle pl-0.5 pr-2 text-[11px] text-muted">
                <ProviderMark provider={acc.provider} size="xs" /> {acc.address} · {accountNote(acc)}
              </span>
              <span className="text-[11px] text-muted">
                {msgs.length} message{msgs.length > 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {thread.category !== "spam" && !lead?.suspicious && <AssistantCard view={view} thread={thread} />}

          {lead?.suspicious && (
            <div className="flex items-start gap-3 rounded-2xl bg-rose-600 px-4 py-3 text-sm text-white shadow-card">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <div className="font-semibold">Suspicious email. Its instructions are never followed, its links are not opened, and replies are blocked.</div>
                <div className="mt-0.5 text-white/85">{lead.reason}</div>
              </div>
            </div>
          )}

          {lead && !lead.suspicious && (
            <div className={cn("rounded-2xl border border-l-4 border-line p-4", meta.border, meta.soft)}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("grid h-7 w-7 place-items-center rounded-lg text-white", meta.stripe)}>
                  <meta.icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold">Why it's in {meta.short}</span>
                <Badge tone={lead.decided_by === "user" ? "violet" : "neutral"} className="rounded-full">
                  {lead.decided_by === "user" ? "set by you" : lead.decided_by === "ai" ? "AI-assisted" : "sorted by rules"}
                </Badge>
                <button
                  onClick={() => setPrefs({ highlight: !prefs.highlight })}
                  className={cn("ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition", prefs.highlight ? "bg-amber-200/70 text-amber-900 dark:bg-amber-400/20 dark:text-amber-200" : "text-muted hover:bg-fg/[0.06]")}
                  aria-pressed={prefs.highlight}
                >
                  <Highlighter className="h-3.5 w-3.5" /> {prefs.highlight ? "Evidence highlighted" : "Highlight evidence"}
                </button>
              </div>
              <p className="mt-2 text-sm leading-relaxed">{lead.reason}</p>
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-sm shadow-card">
                <Sparkles className={cn("h-3.5 w-3.5", meta.text)} />
                <span className="font-medium">Next:</span> {lead.next_action}
              </div>
              {f && (f.owner !== undefined || f.due_history.length > 0 || f.references.length > 0 || f.duplicate_count > 0 || f.constraints.length > 0) && (
                <dl className="mt-3 grid gap-x-4 gap-y-1.5 rounded-xl bg-surface/70 p-3 text-xs sm:grid-cols-[6.5rem_1fr]">
                  {f.owner !== undefined && (
                    <>
                      <dt className="text-muted">Owner</dt>
                      <dd>{f.owner ?? <span className="font-medium text-amber-700 dark:text-amber-300">no confirmed owner</span>}</dd>
                    </>
                  )}
                  {f.due_history.length > 0 && (
                    <>
                      <dt className="text-muted">Deadline</dt>
                      <dd>
                        {f.due_history.map((h) => (
                          <span key={h.email_id + h.date} className={cn("mr-2", h.superseded_by ? "text-muted line-through" : "font-semibold")}>
                            {formatDate(h.date)}
                          </span>
                        ))}
                        {f.due_history.some((h) => h.superseded_by) && <span className="text-emerald-700 dark:text-emerald-300">corrected; the latest date applies</span>}
                      </dd>
                    </>
                  )}
                  {f.references.length > 0 && (
                    <>
                      <dt className="text-muted">Tracked as</dt>
                      <dd>{f.references.join(", ")} (no new ticket)</dd>
                    </>
                  )}
                  {f.duplicate_count > 0 && (
                    <>
                      <dt className="text-muted">Repeats</dt>
                      <dd>{f.duplicate_count} repeated request merged, counted once</dd>
                    </>
                  )}
                  {f.constraints.map((c) => (
                    <span key={c} className="contents">
                      <dt className="text-muted">Note</dt>
                      <dd>{c}</dd>
                    </span>
                  ))}
                </dl>
              )}
              {lead.flags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {lead.flags.includes("spoofed_urgency") && <Badge tone="amber">urgent wording, nothing asked</Badge>}
                  {lead.flags.includes("quoted_history_ignored") && <Badge>old quoted deadline ignored</Badge>}
                  {lead.flags.includes("attachment_unverified") && <Badge tone="amber">attachment mentioned, not verified</Badge>}
                  {lead.flags.includes("needs_review") && <Badge tone="amber">please check the category</Badge>}
                </div>
              )}
            </div>
          )}

          {(task || proposal) && (
            <div className="grid gap-3 md:grid-cols-2">
              {task && <TaskCard task={task} />}
              {proposal && <ProposalCard view={view} proposal={proposal} />}
            </div>
          )}

          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {msgs.map((m) =>
              open.has(m.id) ? (
                <MessageBody key={m.id} view={view} m={m} provider={acc.provider} highlight={prefs.highlight} isLead={m.id === lead?.message_id} threadSubject={thread.subject} />
              ) : (
                <button key={m.id} onClick={() => setOpen((o) => new Set([...o, m.id]))} className="flex w-full items-center gap-3 bg-subtle/50 px-4 py-3 text-left hover:bg-subtle">
                  <SenderAvatar name={nameOf(m.from)} size="sm" />
                  <span className="w-32 shrink-0 truncate text-sm font-semibold">{m.direction === "outbound" ? "me" : nameOf(m.from)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">{(splitQuoted(m.body).fresh || m.body).replace(/\s+/g, " ")}</span>
                  <span className="shrink-0 text-xs text-muted">{localTime(m.received_at, prefs.timezone)}</span>
                </button>
              ),
            )}
          </div>

          {thread.category !== "spam" && <ReplyEditor view={view} thread={thread} account={acc} />}
        </div>
      </div>
    </section>
  );
}

/** The fresh text of a message, with the sentences the assistant relied on marked. */
function highlighted(text: string, marks: { quote: string; kind: string }[]): ReactNode {
  const ranges = marks
    .map((m) => ({ ...m, at: text.indexOf(m.quote) }))
    .filter((m) => m.at >= 0 && m.quote.trim().length > 3)
    .sort((a, b) => a.at - b.at);
  const out: ReactNode[] = [];
  let pos = 0;
  for (const r of ranges) {
    if (r.at < pos) continue;
    out.push(text.slice(pos, r.at));
    out.push(
      <mark key={r.at} title={`The assistant used this for ${FACT_LABEL[r.kind] ?? r.kind.replace(/_/g, " ")}`} className="rounded bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-400/25">
        {r.quote}
      </mark>,
    );
    pos = r.at + r.quote.length;
  }
  out.push(text.slice(pos));
  return out;
}

const bare = (s: string) => s.replace(/^((re|fwd?|fw)s*:s*)+/i, "").trim().toLowerCase();

function MessageBody({ view, m, provider, highlight, isLead, threadSubject }: { view: MailboxView; m: MailMessage; provider: MailAccount["provider"]; highlight: boolean; isLead: boolean; threadSubject: string }) {
  const tz = useApp((s) => s.prefs.timezone);
  const [showQuoted, setShowQuoted] = useState(false);
  const { fresh, quoted } = splitQuoted(m.body);
  const ins = view.insights[m.id];
  const d = view.decisions[m.id];
  const marks = highlight && d && !ins?.suspicious ? d.facts.filter((x) => x.evidence.email_id === m.id).map((x) => ({ quote: x.evidence.quote, kind: x.kind })) : [];
  const text = fresh || m.body;
  return (
    <article className={cn("bg-surface px-4 py-4 sm:px-5", m.direction === "outbound" && "bg-brand-soft/25")}>
      <header className="flex items-start gap-3">
        <SenderAvatar name={nameOf(m.from)} provider={m.direction === "inbound" ? provider : undefined} size="lg" />
        <div className="min-w-0 flex-1 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="font-semibold">{nameOf(m.from)}</span>
            <span className="text-xs text-muted">&lt;{m.from.email}&gt;</span>
            {m.direction === "outbound" && <Badge tone="brand">{m.simulated ? "you · demo send" : "you"}</Badge>}
            <span className="ml-auto text-xs text-muted" title={m.received_at}>
              {localTime(m.received_at, tz)} ({ago(m.received_at, view.now)})
            </span>
          </div>
          {bare(m.subject) !== bare(threadSubject) && (
            <div className="mt-0.5 text-xs">
              <span className="text-muted">Subject line: </span>
              <span className="text-muted line-through" title="The subject line does not match what the email is about, so it was grouped by its content">
                {m.subject}
              </span>
              <span className="ml-1.5 rounded bg-subtle px-1.5 py-px text-[10px] text-muted">grouped by content</span>
            </div>
          )}
          {(m.to.length > 0 || m.cc.length > 0) && (
            <div className="text-xs text-muted">
              to {m.to.map(nameOf).join(", ") || "-"}
              {m.cc.length ? ` · cc ${m.cc.map(nameOf).join(", ")}` : ""}
            </div>
          )}
        </div>
      </header>
      <div className={cn("mt-3 whitespace-pre-wrap break-words pl-0 text-[15px] leading-7 sm:pl-[52px]", ins?.suspicious && "rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-fg/80")}>{marks.length ? highlighted(text, marks) : text}</div>
      {quoted && (
        <div className="mt-2 sm:pl-[52px]">
          <Tip content={showQuoted ? "Hide quoted text" : "Show quoted text"}>
            <button onClick={() => setShowQuoted((v) => !v)} aria-label={showQuoted ? "Hide quoted text" : "Show quoted text"} className="rounded-full bg-subtle px-2 text-muted hover:bg-fg/10">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </Tip>
          {showQuoted && (
            <div className="mt-2 border-l-2 border-line pl-3 text-sm text-muted">
              <div className="label-xs mb-1">Earlier message · not used for tasks or deadlines</div>
              <p className="whitespace-pre-wrap">{quoted}</p>
            </div>
          )}
          {!showQuoted && <span className="ml-2 text-[11px] text-muted">Quoted history is ignored for tasks and deadlines.</span>}
        </div>
      )}
      {m.attachments.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 sm:pl-[52px]">
          {m.attachments.map((a) => (
            <span key={a.name} className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-card">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-500/10">
                <FileText className="h-4 w-4" />
              </span>
              <span>
                <span className="block font-medium">{a.name}</span>
                {a.size_kb ? <span className="text-muted">{a.size_kb} KB</span> : null}
              </span>
            </span>
          ))}
        </div>
      )}
      {ins && !isLead && (
        <div className="mt-3 flex items-start gap-1.5 text-xs text-muted sm:pl-[52px]">
          <CategoryBadge category={ins.category} /> <span>{ins.reason}</span>
        </div>
      )}
    </article>
  );
}

function TaskCard({ task }: { task: TaskItem }) {
  const apply = useMailbox((s) => s.apply);
  const actor = useApp((s) => s.prefs.name);
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          <ListTodo className="h-4 w-4" />
        </span>
        Task found in this email
        {task.overdue && <Badge tone="solidRed">overdue</Badge>}
        {task.status === "completed" && <Badge tone="green">done</Badge>}
      </div>
      <p className="mt-2.5 text-sm font-medium">{task.title}</p>
      <dl className="mt-2 grid grid-cols-[4.5rem_1fr] gap-y-1 text-xs">
        <dt className="text-muted">Due</dt>
        <dd className={cn(task.overdue && "font-medium text-rose-600")}>{task.due ? `${formatDate(task.due.date)}${task.due.time ? ` at ${task.due.time}` : ""} (UTC${offsetLabel(task.due.tz_offset)})` : (task.due_note ?? "no deadline given")}</dd>
        <dt className="text-muted">Owner</dt>
        <dd>{task.owner ?? "not stated"}</dd>
      </dl>
      {task.due?.needs_confirmation.map((n) => (
        <p key={n} className="mt-1.5 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3 w-3" /> Please confirm: {n}
        </p>
      ))}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {task.confirmed ? (
          <>
            <Badge tone="green">
              <Check className="h-3 w-3" /> in Tasks
            </Badge>
            {task.status !== "completed" && (
              <Button size="xs" onClick={() => apply((s) => updateTask(s, task.id, { status: "completed" }, actor, now()), "Task completed")}>
                Mark done
              </Button>
            )}
          </>
        ) : (
          <>
            <Button size="xs" variant="primary" onClick={() => apply((s) => updateTask(s, task.id, { confirmed: true }, actor, now()), "Added to Tasks")}>
              Add to tasks
            </Button>
            <Button size="xs" variant="ghost" onClick={() => apply((s) => updateTask(s, task.id, { dismissed: true }, actor, now()), "Suggestion dismissed")}>
              Dismiss
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function ProposalCard({ view, proposal }: { view: MailboxView; proposal: EventProposal }) {
  const { apply, addToCalendar, busy, calendars } = useMailbox();
  const actor = useApp((s) => s.prefs.name);
  const [date, setDate] = useState(proposal.when?.date ?? "");
  const [timeV, setTimeV] = useState(proposal.when?.time ?? "");
  const [duration, setDuration] = useState(String(proposal.duration_min ?? 30));
  const [reminder, setReminder] = useState("15");
  const kindLabel = { meeting_request: "Meeting request", invitation: "Invitation", confirmation: "Confirmed appointment", reschedule: "Reschedule request", cancellation: "Cancellation" }[proposal.kind];
  const target = calendars[0] ? (calendars[0].calendar === "google" ? "Google Calendar" : "Outlook Calendar") : "the demo calendar";
  return (
    <div id={`proposal-${proposal.id}`} className={cn("rounded-2xl border bg-surface p-4 shadow-card", proposal.conflicts.length && proposal.status === "proposed" ? "border-rose-300 dark:border-rose-500/40" : "border-line")}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
          <CalendarPlus className="h-4 w-4" />
        </span>
        {kindLabel}
        {proposal.status !== "proposed" && <Badge tone={proposal.status === "accepted" ? "green" : "neutral"}>{proposal.status === "accepted" ? "in calendar" : "declined"}</Badge>}
      </div>
      <p className="mt-2.5 text-sm font-medium">{proposal.title}</p>
      {proposal.when ? (
        <div className="mt-2 flex items-center gap-3">
          <span className="grid w-12 shrink-0 overflow-hidden rounded-lg border border-line text-center shadow-card">
            <span className="bg-rose-500 text-[9px] font-bold uppercase leading-4 text-white">{new Date(`${proposal.when.date}T12:00:00Z`).toLocaleString("en", { month: "short", timeZone: "UTC" })}</span>
            <span className="py-0.5 text-lg font-semibold leading-6">{Number(proposal.when.date.slice(8, 10))}</span>
          </span>
          <span className="text-xs text-muted">
            <span className="block font-medium text-fg">{formatDate(proposal.when.date)}</span>
            {proposal.when.time ? `${proposal.when.time}${proposal.when.end_time ? `–${proposal.when.end_time}` : ""}` : "No time given"} (UTC{offsetLabel(proposal.when.tz_offset)})
          </span>
        </div>
      ) : (
        <div className="mt-1 text-xs text-muted">No date in the email</div>
      )}
      <div className="mt-2 space-y-0.5 text-xs text-muted">
        {proposal.location && (
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {proposal.location}
          </div>
        )}
        {proposal.link && (
          <a href={proposal.link} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1 truncate text-brand hover:underline">
            <Video className="h-3 w-3" /> {proposal.link}
          </a>
        )}
        {proposal.participants.length > 0 && (
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3" /> {proposal.participants.map((p) => p.name ?? p.email).join(", ")}
          </div>
        )}
      </div>
      {proposal.when?.needs_confirmation.map((n) => (
        <p key={n} className="mt-1.5 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3 w-3" /> Please confirm: {n}
        </p>
      ))}
      {proposal.conflicts.length > 0 && <p className="mt-2 rounded-lg bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">Clashes with: {proposal.conflicts.join(", ")}</p>}
      {proposal.status === "proposed" && proposal.kind !== "cancellation" && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className="field" />
            <input type="time" value={timeV} onChange={(e) => setTimeV(e.target.value)} aria-label="Start time" className="field" />
            <select value={duration} onChange={(e) => setDuration(e.target.value)} aria-label="Duration" className="field">
              {[15, 30, 45, 60, 90, 120].map((d) => (
                <option key={d} value={d}>
                  {d} min
                </option>
              ))}
            </select>
            <select value={reminder} onChange={(e) => setReminder(e.target.value)} aria-label="Reminder" className="field">
              {[
                ["0", "No reminder"],
                ["10", "10 min before"],
                ["15", "15 min before"],
                ["30", "30 min before"],
                ["60", "1 hour before"],
                ["1440", "1 day before"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Button
              size="xs"
              variant="primary"
              disabled={busy[`event:${proposal.id}`]}
              onClick={() => addToCalendar(view, proposal.id, { date: date || undefined, time: timeV || null, duration_min: Number(duration), reminders_min: reminder === "0" ? [] : [Number(reminder)] })}
            >
              {busy[`event:${proposal.id}`] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />} Add to calendar
            </Button>
            <Button size="xs" variant="ghost" onClick={() => apply((s) => rejectProposal(s, proposal.id, actor, now()), "Declined; nothing added")}>
              Decline
            </Button>
            <span className="text-[11px] text-muted">goes to {target}</span>
          </div>
        </>
      )}
    </div>
  );
}

function ReplyEditor({ view, thread, account }: { view: MailboxView; thread: MailThread; account: MailAccount }) {
  const { state, apply, send, enableSend, busy } = useMailbox();
  const { role, prefs } = useApp();
  const saved = state.drafts[thread.key];
  const headers = replyHeaders(view, thread.key, account);
  const proposal = view.proposals.find((p) => p.source.thread_key === thread.key && p.when?.time);
  const [tone, setTone] = useState<DraftTone>(saved?.tone ?? "standard");
  const suggested = thread.draft?.tones[tone] ?? thread.draft?.body ?? `Hi,\n\n\n\nRegards,\n${prefs.name}`;
  const [to, setTo] = useState(addrText(saved?.to ?? headers?.to ?? []));
  const [cc, setCc] = useState(addrText(saved?.cc ?? headers?.cc ?? []));
  const [subject, setSubject] = useState(saved?.subject ?? headers?.subject ?? `Re: ${thread.subject}`);
  const assist = useAssistant((s) => s.results[thread.key]);
  const aiDraft = assist && assist.for_message === lastMessageId(thread) && assist.reply ? assist.reply : null;
  const [body, setBody] = useState(saved?.body ?? aiDraft ?? suggested);
  const [confirming, setConfirming] = useState(false);
  const [ticked, setTicked] = useState<string[]>([]);
  const [details, setDetails] = useState(false);
  const [ai, setAi] = useState<{ enabled: boolean; model: string | null }>({ enabled: false, model: null });
  const [aiText, setAiText] = useState<string | null>(saved ? null : aiDraft);
  const [thinking, setThinking] = useState(false);
  const toast = useApp((s) => s.toast);
  useEffect(() => {
    aiStatus().then(setAi);
  }, []);
  useEffect(() => {
    // The assistant's checked draft arrives in the background: use it only while the person has not started their own.
    if (aiDraft && !saved && body === suggested) {
      setBody(aiDraft);
      setAiText(aiDraft);
    }
  }, [aiDraft]);
  if (!headers) return null;

  const lint = lintReply(view, thread.key, body);
  const dirty = !saved || saved.body !== body || saved.subject !== subject || addrText(saved.to) !== to || addrText(saved.cc) !== cc;
  const check = sendCheck(view, state, thread.key, role);
  const sent = saved?.sent_at;
  const source = body === aiText ? "ai" : body === suggested ? "template" : "edited";
  const fields = () => ({ thread_key: thread.key, account_id: account.id, in_reply_to: headers.in_reply_to, to: addrList(to), cc: addrList(cc), subject, body, tone, source: source as "ai" | "template" | "edited" });
  const cycleTone = () => {
    const order = TONES.map((t) => t.id);
    const next = order[(order.indexOf(tone) + 1) % order.length];
    setTone(next);
    setBody(thread.draft?.tones[next] ?? suggested);
  };
  const regenerate = async () => {
    if (!ai.enabled) return cycleTone();
    setThinking(true);
    const msgs = thread.message_ids.map((id) => view.messages.find((m) => m.id === id)!).filter((m) => !view.insights[m.id]?.suspicious);
    const r = await aiReply({ subject: thread.subject, tone, user_name: prefs.name, messages: msgs.slice(-10).map((m) => ({ from: nameOf(m.from), direction: m.direction, received_at: m.received_at, body: m.body.slice(0, 6000) })) });
    setThinking(false);
    if (r.ok) {
      setBody(r.body);
      setAiText(r.body);
    } else {
      toast(`AI draft unavailable: ${r.error}. Showing a template instead.`, "warn");
      cycleTone();
    }
  };
  const recipient = to.split(",")[0]?.replace(/<.*>/, "").trim() || "sender";

  return (
    <div className={cn("overflow-hidden rounded-2xl border bg-surface shadow-card", sent ? "border-emerald-300 dark:border-emerald-500/40" : "border-line")}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-subtle/60 px-4 py-2.5">
        <Reply className="h-4 w-4 text-muted" />
        <span className="text-sm font-semibold">Reply to {recipient}</span>
        <Badge tone={source === "ai" ? "violet" : "neutral"} className="rounded-full">
          {source === "ai" ? `AI draft · ${assist?.model ?? ai.model}` : source === "template" ? "suggested draft" : "edited"}
        </Badge>
        {saved?.approved_at && !dirty && (
          <Badge tone="green" className="rounded-full">
            <BadgeCheck className="h-3 w-3" /> approved
          </Badge>
        )}
        {sent && (
          <Badge tone="green" className="rounded-full">
            {saved.sent_simulated ? "sent (demo)" : "sent"}
          </Badge>
        )}
        {!sent && (
          <span className="ml-auto">
            <Segmented
              value={tone}
              onChange={(v) => {
                setTone(v);
                if (thread.draft?.tones[v]) setBody(thread.draft.tones[v]!);
              }}
              options={TONES.map((x) => ({ value: x.id, label: x.label }))}
            />
          </span>
        )}
      </div>
      <div className="text-sm">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <span className="w-14 text-xs text-muted">To</span>
          <input value={to} onChange={(e) => setTo(e.target.value)} disabled={!!sent} aria-label="To" className="h-10 flex-1 bg-transparent outline-none" />
          {!details && (
            <button onClick={() => setDetails(true)} className="inline-flex items-center gap-0.5 text-xs text-muted hover:text-fg">
              Cc, subject <ChevronDown className="h-3 w-3" />
            </button>
          )}
        </div>
        {(details || cc) && (
          <label className="flex items-center gap-2 border-b border-line px-4">
            <span className="w-14 text-xs text-muted">Cc</span>
            <input value={cc} onChange={(e) => setCc(e.target.value)} disabled={!!sent} aria-label="Cc" className="h-10 flex-1 bg-transparent outline-none" />
          </label>
        )}
        {details && (
          <label className="flex items-center gap-2 border-b border-line px-4">
            <span className="w-14 text-xs text-muted">Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!!sent} aria-label="Subject" className="h-10 flex-1 bg-transparent outline-none" />
          </label>
        )}
        <div className="px-4 pt-3">
          <textarea
            id="reply-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={!!sent}
            rows={8}
            aria-label="Reply body"
            className={cn("w-full resize-y rounded-xl border bg-canvas/40 p-3 text-[15px] leading-7 outline-none transition", lint.ok ? "border-transparent focus:border-brand/50 focus:bg-surface" : "border-rose-400 bg-rose-50/40 dark:bg-rose-500/5")}
          />
        </div>
        <div className="px-4 pb-1">
          {lint.ok ? (
            !sent && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" /> Claims check passed: no invented attachments, payments, approvals or dates.
              </div>
            )
          ) : (
            <ul className="space-y-1">
              {lint.violations.map((v, i) => (
                <li key={i} className="flex gap-2 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-800 dark:text-rose-200">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> "{v.term}": {v.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
        {!sent && (
          <div className="flex flex-wrap gap-1.5 px-4 pt-2">
            <button onClick={regenerate} disabled={thinking} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-medium text-fg/85 hover:bg-subtle disabled:opacity-50">
              {thinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 text-violet-500" />}
              {ai.enabled ? `Regenerate with AI (${TONES.find((t) => t.id === tone)?.label.toLowerCase()})` : "Regenerate in another tone"}
            </button>
            {proposal && (
              <button
                onClick={() => setBody(`Hi,\n\nThanks, ${formatDate(proposal.when!.date)} at ${proposal.when!.time} works for me. See you then.\n\nRegards,\n${prefs.name}`)}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-medium text-fg/85 hover:bg-subtle"
              >
                <CalendarPlus className="h-3.5 w-3.5 text-sky-500" /> Accept {formatDate(proposal.when!.date)} at {proposal.when!.time}
              </button>
            )}
          </div>
        )}
        {!sent && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <Tip content={dirty ? "Save the draft first" : check.ok ? (check.simulated ? "Demo account: the send is simulated" : `Sends from ${account.address}`) : check.blockers.join("; ")}>
              <span>
                <Button variant="primary" size="md" className="rounded-full px-5" disabled={dirty || !check.ok || busy[`send:${thread.key}`]} onClick={() => setConfirming(true)}>
                  {busy[`send:${thread.key}`] ? <Loader2 className="h-4 w-4 animate-spin" /> : check.ok ? <Send className="h-4 w-4" /> : <Lock className="h-4 w-4" />} Send
                </Button>
              </span>
            </Tip>
            <Button className="rounded-full" disabled={!lint.ok || !dirty || role === "viewer"} onClick={() => apply((s) => saveReplyDraft(view, s, fields(), prefs.name, now()), "Draft saved")}>
              Save draft
            </Button>
            {role === "approver" && saved && !saved.approved_at && !dirty && (
              <Button variant="success" className="rounded-full" onClick={() => apply((s) => approveReplyDraft(s, thread.key, role, prefs.name, now()), "Reply approved (not sent yet)")}>
                <BadgeCheck className="h-4 w-4" /> Approve
              </Button>
            )}
            {account.mode === "connected" && !account.send_enabled && (
              <Button className="rounded-full" disabled={busy[`send-permission:${account.id}`]} onClick={() => enableSend(account.id)}>
                <Lock className="h-4 w-4" /> Allow sending from {account.address}
              </Button>
            )}
            {saved && (
              <Tip content="Discard draft">
                <button onClick={() => apply((s) => discardReplyDraft(s, thread.key, prefs.name, now()), "Draft discarded")} aria-label="Discard" className="ml-auto grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-fg/[0.08] hover:text-rose-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </Tip>
            )}
            {!check.ok && !dirty && (
              <span className="flex w-full items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <Lock className="h-3.5 w-3.5" /> {check.blockers.join("; ")}
              </span>
            )}
            {dirty && <span className="w-full text-xs text-muted">Save the draft to send it. Nothing is ever sent automatically.</span>}
          </div>
        )}
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming} title="Send this reply?" description={check.simulated ? "Demo account: nothing leaves the app. The reply is added to the conversation, marked as a demo send." : `This sends a real email from ${account.address}.`}>
        <div className="space-y-1 rounded-xl bg-subtle p-3 text-sm">
          <div>
            <span className="text-muted">To:</span> {to}
          </div>
          {cc && (
            <div>
              <span className="text-muted">Cc:</span> {cc}
            </div>
          )}
          <div>
            <span className="text-muted">Subject:</span> {subject}
          </div>
          <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-muted">{body}</p>
        </div>
        {check.confirm.length > 0 && (
          <div className="mt-3 space-y-1.5 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
            <div className="label-xs text-amber-800 dark:text-amber-200">Check before sending</div>
            {check.confirm.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={ticked.includes(c)} onChange={(e) => setTicked((t) => (e.target.checked ? [...t, c] : t.filter((x) => x !== c)))} /> This reply {c}; I have checked it.
              </label>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="rounded-full px-4"
            disabled={check.confirm.some((c) => !ticked.includes(c))}
            onClick={async () => {
              if (await send(view, thread.key, ticked)) setConfirming(false);
            }}
          >
            <Send className="h-4 w-4" /> {check.simulated ? "Send (demo)" : "Send now"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
