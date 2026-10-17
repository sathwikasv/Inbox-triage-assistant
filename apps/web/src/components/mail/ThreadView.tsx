import { useEffect, useState } from "react";
import { AlertTriangle, Archive, ArrowLeft, BadgeCheck, CalendarPlus, Check, ListTodo, Loader2, Lock, MailOpen, Paperclip, Send, ShieldAlert, Sparkles, Star, Trash2, Users } from "lucide-react";
import {
  CATEGORY_LABEL,
  TONES,
  approveReplyDraft,
  archiveThread,
  discardReplyDraft,
  formatDate,
  lintReply,
  offsetLabel,
  rejectProposal,
  replyHeaders,
  saveReplyDraft,
  sendCheck,
  setCategory,
  setRead,
  setStarred,
  splitQuoted,
  updateTask,
  type Category,
  type DraftTone,
  type EventProposal,
  type MailAccount,
  type MailboxView,
  type MailThread,
  type TaskItem,
} from "@c16/core";
import { useApp } from "../../store/app";
import { useMailbox } from "../../store/mailbox";
import { aiReply, aiStatus } from "../../lib/ai";
import { Avatar, Badge, Button, Dialog, Segmented, Tip, cn } from "../../ui";
import { CATS, CAT_TONE, CategoryBadge, PRIORITY_TONE, ProviderMark, accountNote, addrList, addrText, nameOf, shortTime } from "./common";

const now = () => new Date().toISOString();

export function ThreadView({ view, thread, onBack }: { view: MailboxView; thread: MailThread; onBack: () => void }) {
  const { state, apply } = useMailbox();
  const actor = useApp((s) => s.prefs.name);
  const msgs = thread.message_ids.map((id) => view.messages.find((m) => m.id === id)!);
  const acc = view.accounts.find((a) => a.id === thread.account_id)!;
  const inbound = msgs.filter((m) => m.direction === "inbound");
  const lead = [...inbound].reverse().map((m) => view.insights[m.id]).find(Boolean);
  const task = view.tasks.find((t) => t.source.thread_key === thread.key);
  const proposal = view.proposals.find((p) => p.source.thread_key === thread.key);
  const starred = msgs.some((m) => state.starred[m.id] ?? m.starred);
  const f = thread.facts;

  return (
    <section className="min-h-0 overflow-y-auto bg-canvas">
      <div className="mx-auto max-w-3xl space-y-4 p-4 lg:p-6">
        <div className="flex flex-wrap items-start gap-2">
          <Button size="icon" variant="ghost" onClick={onBack} aria-label="Back to the list" className="lg:hidden">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">{thread.subject}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <ProviderMark provider={acc.provider} size="xs" /> {acc.address} · {accountNote(acc)} · {msgs.length} message{msgs.length > 1 ? "s" : ""}
            </div>
          </div>
          <Tip content={starred ? "Unmark important" : "Mark important"}>
            <Button size="icon" variant="ghost" onClick={() => apply((s) => inbound.reduce((a, m) => setStarred(a, m.id, !starred, actor, now()), s))} aria-label={starred ? "Unmark important" : "Mark important"}>
              <Star className={cn("h-4 w-4", starred && "fill-amber-400 text-amber-400")} />
            </Button>
          </Tip>
          <Tip content="Mark unread">
            <Button size="icon" variant="ghost" onClick={() => apply((s) => inbound.reduce((a, m) => setRead(a, m.id, false), s))} aria-label="Mark unread">
              <MailOpen className="h-4 w-4" />
            </Button>
          </Tip>
          <Tip content={thread.archived ? "Move back to the inbox" : "Archive (nothing is deleted)"}>
            <Button size="icon" variant="ghost" onClick={() => apply((s) => archiveThread(s, thread.key, !thread.archived, actor, now()), thread.archived ? "Moved back to the inbox" : "Archived")} aria-label={thread.archived ? "Unarchive" : "Archive"}>
              <Archive className="h-4 w-4" />
            </Button>
          </Tip>
        </div>

        {lead && (
          <div className={cn("card p-4", lead.suspicious && "border-rose-500/50 bg-rose-500/[0.04]")}>
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand" />
              <span className="text-sm font-semibold">Assistant</span>
              <Badge tone={CAT_TONE[lead.category]}>{CATEGORY_LABEL[lead.category]}</Badge>
              <Badge tone={PRIORITY_TONE[lead.priority]}>{lead.priority} priority</Badge>
              {lead.decided_by === "user" && <Badge tone="violet">set by you</Badge>}
              <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
                Category
                <select
                  value={state.categories[lead.message_id] ?? ""}
                  onChange={(e) => apply((s) => setCategory(s, lead.message_id, (e.target.value || null) as Category | null, actor, now()), "Category updated")}
                  className="rounded border border-line bg-surface px-1 py-0.5 text-xs text-fg"
                  aria-label="Change category"
                >
                  <option value="">Suggested</option>
                  {CATS.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {lead.suspicious && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm text-white">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> Suspicious email. Its instructions are never followed, its links are not opened, and replies are blocked.
              </div>
            )}
            <p className="mt-2 text-sm">{lead.reason}</p>
            <p className="mt-1 text-sm">
              <span className="font-medium">Next: </span>
              {lead.next_action}
            </p>
            {f && !lead.suspicious && (f.owner !== undefined || f.due_history.length > 0 || f.references.length > 0 || f.duplicate_count > 0 || f.constraints.length > 0) && (
              <dl className="mt-3 grid gap-x-4 gap-y-1 border-t border-line pt-3 text-xs sm:grid-cols-[6rem_1fr]">
                {f.owner !== undefined && (
                  <>
                    <dt className="text-muted">Owner</dt>
                    <dd>{f.owner ?? <span className="text-amber-700 dark:text-amber-300">no confirmed owner</span>}</dd>
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

        <div className="space-y-3">
          {msgs.map((m) => {
            const { fresh, quoted } = splitQuoted(m.body);
            const ins = view.insights[m.id];
            return (
              <article key={m.id} className={cn("card p-4", m.direction === "outbound" && "border-brand/30 bg-brand-soft/30")}>
                <header className="flex items-start gap-3">
                  <Avatar name={nameOf(m.from)} />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold">{nameOf(m.from)}</span>
                      <span className="text-xs text-muted">&lt;{m.from.email}&gt;</span>
                      {m.direction === "outbound" && <Badge tone="brand">{m.simulated ? "you · demo send" : "you"}</Badge>}
                      <span className="ml-auto text-xs text-muted">{shortTime(m.received_at)}</span>
                    </div>
                    {(m.to.length > 0 || m.cc.length > 0) && (
                      <div className="text-xs text-muted">
                        to {m.to.map(nameOf).join(", ") || "-"}
                        {m.cc.length ? ` · cc ${m.cc.map(nameOf).join(", ")}` : ""}
                      </div>
                    )}
                  </div>
                </header>
                <div className={cn("mt-3 whitespace-pre-wrap break-words text-[15px] leading-7", ins?.suspicious && "rounded-lg border border-rose-500/30 bg-rose-500/5 p-3")}>{fresh || m.body}</div>
                {quoted && (
                  <div className="mt-3 border-l-2 border-line pl-3 text-sm text-muted">
                    <div className="label-xs mb-1">Earlier message · not used for tasks or deadlines</div>
                    <p className="whitespace-pre-wrap">{quoted}</p>
                  </div>
                )}
                {m.attachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.attachments.map((a) => (
                      <span key={a.name} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs">
                        <Paperclip className="h-3 w-3" /> {a.name}
                        {a.size_kb ? ` · ${a.size_kb} KB` : ""}
                      </span>
                    ))}
                  </div>
                )}
                {ins && m.id !== lead?.message_id && (
                  <div className="mt-2 flex items-start gap-1.5 text-xs text-muted">
                    <CategoryBadge category={ins.category} /> <span>{ins.reason}</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {thread.category !== "spam" && <ReplyEditor view={view} thread={thread} account={acc} />}
      </div>
    </section>
  );
}

function TaskCard({ task }: { task: TaskItem }) {
  const apply = useMailbox((s) => s.apply);
  const actor = useApp((s) => s.prefs.name);
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ListTodo className="h-4 w-4 text-amber-500" /> Task
        {task.overdue && <Badge tone="solidRed">overdue</Badge>}
        {task.status === "completed" && <Badge tone="green">done</Badge>}
      </div>
      <p className="mt-2 text-sm font-medium">{task.title}</p>
      <dl className="mt-2 grid grid-cols-[4.5rem_1fr] gap-y-1 text-xs">
        <dt className="text-muted">Due</dt>
        <dd>{task.due ? `${formatDate(task.due.date)}${task.due.time ? ` at ${task.due.time}` : ""} (UTC${offsetLabel(task.due.tz_offset)})` : (task.due_note ?? "no deadline given")}</dd>
        <dt className="text-muted">Owner</dt>
        <dd>{task.owner ?? "not stated"}</dd>
      </dl>
      {task.due?.needs_confirmation.map((n) => (
        <p key={n} className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          Please confirm: {n}
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
    <div className="card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <CalendarPlus className="h-4 w-4 text-sky-500" /> {kindLabel}
        {proposal.status !== "proposed" && <Badge tone={proposal.status === "accepted" ? "green" : "neutral"}>{proposal.status === "accepted" ? "in calendar" : "declined"}</Badge>}
      </div>
      <p className="mt-2 text-sm font-medium">{proposal.title}</p>
      <div className="mt-1 text-xs text-muted">
        {proposal.when ? `${formatDate(proposal.when.date)}${proposal.when.time ? ` · ${proposal.when.time}${proposal.when.end_time ? `–${proposal.when.end_time}` : ""}` : ""} (UTC${offsetLabel(proposal.when.tz_offset)})` : "No date in the email"}
        {proposal.location && ` · ${proposal.location}`}
      </div>
      {proposal.link && (
        <a href={proposal.link} target="_blank" rel="noreferrer noopener" className="mt-0.5 block truncate text-xs text-brand hover:underline">
          {proposal.link}
        </a>
      )}
      {proposal.participants.length > 0 && (
        <div className="mt-1 flex items-center gap-1 text-xs text-muted">
          <Users className="h-3 w-3" /> {proposal.participants.map((p) => p.name ?? p.email).join(", ")}
        </div>
      )}
      {proposal.when?.needs_confirmation.map((n) => (
        <p key={n} className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          Please confirm: {n}
        </p>
      ))}
      {proposal.conflicts.length > 0 && <p className="mt-1 text-xs font-medium text-rose-600">Clashes with: {proposal.conflicts.join(", ")}</p>}
      {proposal.status === "proposed" && proposal.kind !== "cancellation" && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs" />
            <input type="time" value={timeV} onChange={(e) => setTimeV(e.target.value)} aria-label="Start time" className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs" />
            <select value={duration} onChange={(e) => setDuration(e.target.value)} aria-label="Duration" className="rounded-md border border-line bg-surface px-1 py-1 text-xs">
              {[15, 30, 45, 60, 90, 120].map((d) => (
                <option key={d} value={d}>
                  {d} min
                </option>
              ))}
            </select>
            <select value={reminder} onChange={(e) => setReminder(e.target.value)} aria-label="Reminder" className="rounded-md border border-line bg-surface px-1 py-1 text-xs">
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
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
  const [body, setBody] = useState(saved?.body ?? suggested);
  const [confirming, setConfirming] = useState(false);
  const [ticked, setTicked] = useState<string[]>([]);
  const [ai, setAi] = useState<{ enabled: boolean; model: string | null }>({ enabled: false, model: null });
  const [aiText, setAiText] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const toast = useApp((s) => s.toast);
  useEffect(() => {
    aiStatus().then(setAi);
  }, []);
  if (!headers) return null;

  const lint = lintReply(view, thread.key, body);
  const dirty = !saved || saved.body !== body || saved.subject !== subject || addrText(saved.to) !== to || addrText(saved.cc) !== cc;
  const check = sendCheck(view, state, thread.key, role);
  const sent = saved?.sent_at;
  const fields = () => ({ thread_key: thread.key, account_id: account.id, in_reply_to: headers.in_reply_to, to: addrList(to), cc: addrList(cc), subject, body, tone, source: (body === aiText ? "ai" : body === suggested ? "template" : "edited") as "ai" | "template" | "edited" });
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

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <Send className="h-4 w-4 text-brand" />
        <span className="text-sm font-semibold">Reply</span>
        <Badge tone={body === aiText ? "violet" : "neutral"}>{body === aiText ? `AI draft · ${ai.model}` : body === suggested ? "suggested draft" : "edited"}</Badge>
        {saved?.approved_at && !dirty && (
          <Badge tone="green">
            <BadgeCheck className="h-3 w-3" /> approved
          </Badge>
        )}
        {sent && <Badge tone="green">{saved.sent_simulated ? "sent (demo)" : "sent"}</Badge>}
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
      </div>
      <div className="space-y-2 p-4 text-sm">
        {(
          [
            ["To", to, setTo],
            ["Cc", cc, setCc],
            ["Subject", subject, setSubject],
          ] as const
        ).map(([label, value, set]) => (
          <label key={label} className="flex items-center gap-2 border-b border-line pb-2">
            <span className="w-14 text-xs text-muted">{label}</span>
            <input value={value} onChange={(e) => set(e.target.value)} disabled={!!sent} aria-label={label} className="flex-1 bg-transparent outline-none" />
          </label>
        ))}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={!!sent} rows={7} aria-label="Reply body" className={cn("w-full resize-y rounded-lg border bg-canvas/40 p-3 text-[15px] leading-7 outline-none", lint.ok ? "border-line focus:border-brand/50" : "border-rose-400")} />
        {!lint.ok && (
          <ul className="space-y-1">
            {lint.violations.map((v, i) => (
              <li key={i} className="flex gap-2 rounded-md bg-rose-500/10 px-2 py-1 text-xs text-rose-800 dark:text-rose-200">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> "{v.term}": {v.reason}
              </li>
            ))}
          </ul>
        )}
        {!sent && (
          <div className="flex flex-wrap gap-3 text-xs">
            <button onClick={regenerate} disabled={thinking} className="inline-flex items-center gap-1 font-medium text-brand hover:underline disabled:opacity-50">
              {thinking && <Loader2 className="h-3 w-3 animate-spin" />}
              {ai.enabled ? `Regenerate with AI (${TONES.find((t) => t.id === tone)?.label.toLowerCase()})` : "Regenerate in another tone"}
            </button>
            {proposal && (
              <button onClick={() => setBody(`Hi,\n\nThanks, ${formatDate(proposal.when!.date)} at ${proposal.when!.time} works for me. See you then.\n\nRegards,\n${prefs.name}`)} className="font-medium text-brand hover:underline">
                Accept {formatDate(proposal.when!.date)} at {proposal.when!.time}
              </button>
            )}
          </div>
        )}
        {!sent && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button variant="primary" disabled={!lint.ok || !dirty || role === "viewer"} onClick={() => apply((s) => saveReplyDraft(view, s, fields(), prefs.name, now()), "Draft saved")}>
              Save draft
            </Button>
            {role === "approver" && saved && !saved.approved_at && !dirty && (
              <Button variant="success" onClick={() => apply((s) => approveReplyDraft(s, thread.key, role, prefs.name, now()), "Reply approved (not sent yet)")}>
                <BadgeCheck className="h-4 w-4" /> Approve
              </Button>
            )}
            {account.mode === "connected" && !account.send_enabled && (
              <Button disabled={busy[`send-permission:${account.id}`]} onClick={() => enableSend(account.id)}>
                <Lock className="h-4 w-4" /> Allow sending from {account.address}
              </Button>
            )}
            <Tip content={dirty ? "Save the draft first" : check.ok ? (check.simulated ? "Demo account: the send is simulated" : `Sends from ${account.address}`) : check.blockers.join("; ")}>
              <span>
                <Button variant="dark" disabled={dirty || !check.ok || busy[`send:${thread.key}`]} onClick={() => setConfirming(true)}>
                  {busy[`send:${thread.key}`] ? <Loader2 className="h-4 w-4 animate-spin" /> : check.ok ? <Send className="h-4 w-4" /> : <Lock className="h-4 w-4" />} Send
                </Button>
              </span>
            </Tip>
            {saved && (
              <Button variant="ghost" onClick={() => apply((s) => discardReplyDraft(s, thread.key, prefs.name, now()), "Draft discarded")}>
                <Trash2 className="h-4 w-4" /> Discard
              </Button>
            )}
            {!check.ok && !dirty && <span className="text-xs text-amber-700 dark:text-amber-300">{check.blockers.join("; ")}</span>}
          </div>
        )}
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming} title="Send this reply?" description={check.simulated ? "Demo account: nothing leaves the app. The reply is added to the conversation, marked as a demo send." : `This sends a real email from ${account.address}.`}>
        <div className="space-y-1 rounded-lg bg-subtle p-3 text-sm">
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
          <div className="mt-3 space-y-1.5">
            <div className="label-xs">Check before sending</div>
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
            variant="dark"
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
