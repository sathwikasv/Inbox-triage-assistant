import { useNavigate } from "react-router-dom";
import { AlarmClock, AlertTriangle, ArrowRight, CalendarDays, Clock, Hourglass, Inbox, ListTodo, Mail, MailQuestion, MessageSquareWarning, ShieldCheck, Sparkles, Video, type LucideIcon } from "lucide-react";
import { formatDate, type Category, type FollowUpKind, type MailboxView } from "@c16/core";
import { useApp } from "../store/app";
import { useMailbox, useMailboxView } from "../store/mailbox";
import { CAT, CATS, CategoryBadge, PriorityBadge, ProviderMark, accountNote, ago, localTime, nameOf, whenIso, ymdIn } from "../components/mail/common";
import { queue, useThreadContext } from "../lib/folders";
import { useReviewItems } from "../lib/review";
import { AssistantOffer, ConnectMailboxes, ReconnectBar } from "../components/Onboarding";
import { Button, cn } from "../ui";

const FU_ICON: Record<FollowUpKind, { icon: LucideIcon; cls: string; label: string }> = {
  unreplied: { icon: MailQuestion, cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300", label: "You haven't replied" },
  waiting_on_them: { icon: Hourglass, cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", label: "Waiting for a reply" },
  they_promised: { icon: Clock, cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", label: "They promised" },
  we_promised: { icon: Clock, cls: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300", label: "You promised" },
  deadline_soon: { icon: AlarmClock, cls: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300", label: "Deadline soon" },
  overdue: { icon: AlarmClock, cls: "bg-red-600 text-white", label: "Overdue" },
};

function Tile({ label, value, hint, icon: Icon, cls, onClick }: { label: string; value: number; hint: string; icon: LucideIcon; cls: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group rounded-2xl border border-line bg-surface p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-pop">
      <div className="flex items-center gap-2">
        <span className={cn("grid h-8 w-8 place-items-center rounded-xl", cls)}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-xs font-medium text-muted">{label}</span>
      </div>
      <div className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">{value}</div>
      <div className="mt-0.5 truncate text-xs text-muted">{hint}</div>
    </button>
  );
}

function Card({ title, action, onAction, children, className }: { title: string; action?: string; onAction?: () => void; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-line bg-surface shadow-card", className)}>
      <div className="flex items-center px-5 pb-1 pt-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action && (
          <button onClick={onAction} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
            {action} <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/** Category share of the open conversations, as a donut. */
function Donut({ data, total }: { data: { c: Category; n: number }[]; total: number }) {
  const r = 52;
  const C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0" role="img" aria-label="Conversations by category">
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgb(var(--subtle))" strokeWidth="18" />
      {data.map(({ c, n }) => {
        const len = (n / (total || 1)) * C;
        const el = (
          <circle key={c} cx="70" cy="70" r={r} fill="none" stroke={CAT[c].hex} strokeWidth="18" strokeDasharray={`${Math.max(len - 1.5, 0.5)} ${C}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)">
            <title>{`${CAT[c].short}: ${n}`}</title>
          </circle>
        );
        offset += len;
        return el;
      })}
      <text x="70" y="66" textAnchor="middle" className="fill-fg text-[26px] font-semibold">
        {total}
      </text>
      <text x="70" y="86" textAnchor="middle" className="fill-muted text-[10px]">
        conversations
      </text>
    </svg>
  );
}

function Ring({ done, total }: { done: number; total: number }) {
  const r = 22;
  const C = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  return (
    <svg viewBox="0 0 56 56" className="h-14 w-14 shrink-0" role="img" aria-label={`${done} of ${total} tasks completed`}>
      <circle cx="28" cy="28" r={r} fill="none" stroke="rgb(var(--subtle))" strokeWidth="6" />
      <circle cx="28" cy="28" r={r} fill="none" stroke="#30a46c" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${pct * C} ${C}`} transform="rotate(-90 28 28)" />
      <text x="28" y="32" textAnchor="middle" className="fill-fg text-[12px] font-semibold">
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

function agenda(view: MailboxView, tz: string) {
  const nowMs = Date.parse(view.now);
  const today = ymdIn(view.now, tz);
  const tomorrow = ymdIn(nowMs + 86_400_000, tz);
  const items = [
    ...view.events.filter((e) => Date.parse(e.end) >= nowMs).map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end as string | null, tentative: false, link: e.link, conflicts: [] as string[], thread: null as string | null, simulated: e.simulated })),
    ...view.proposals
      .filter((p) => p.status === "proposed" && p.kind !== "cancellation" && p.when?.time)
      .map((p) => {
        const iso = whenIso(p.when!.date, p.when!.time!, p.when!.tz_offset);
        return { id: p.id, title: p.title, start: iso, end: null, tentative: true, link: p.link, conflicts: p.conflicts, thread: p.source.thread_key, simulated: false };
      }),
  ].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const day = (iso: string) => {
    const d = ymdIn(iso, tz);
    return d === today ? "Today" : d === tomorrow ? "Tomorrow" : localTime(iso, tz, { weekday: "long", day: "numeric", month: "short" });
  };
  const out: { day: string; items: typeof items }[] = [];
  for (const it of items.slice(0, 8)) {
    const label = day(it.start);
    const g = out.find((x) => x.day === label);
    if (g) g.items.push(it);
    else out.push({ day: label, items: [it] });
  }
  return out;
}

export default function DashboardPage() {
  const view = useMailboxView();
  const state = useMailbox((s) => s.state);
  const prefs = useApp((s) => s.prefs);
  const navigate = useNavigate();
  const ctx = useThreadContext(view, state);
  const tz = prefs.timezone;
  const nowMs = Date.parse(view.now);
  const today = ymdIn(view.now, tz);
  const hour = Number(localTime(view.now, tz, { hour: "2-digit", hour12: false }));
  const review = useReviewItems();

  if (!view.accounts.length) {
    return (
      <div className="space-y-6">
        <div className="-mx-4 -mt-6 lg:-mx-8">
          <ReconnectBar />
        </div>
        <section className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-brand-soft via-surface to-surface p-8 shadow-card">
          <h1 className="text-3xl font-semibold tracking-tight">Welcome, {prefs.name.split(" ")[0]}</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-fg/80">Connect your mailboxes and Triagedesk sorts every email into a category, finds deadlines and meeting requests, and prepares replies for you to review. Nothing is sent without you.</p>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            {["Read-only until you allow sending", "Sign-in happens on Google, Microsoft or Yahoo", "Drafts are checked for invented claims"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" /> {t}
              </li>
            ))}
          </ul>
        </section>
        <ConnectMailboxes />
        <AssistantOffer />
      </div>
    );
  }

  const live = view.threads.filter((t) => !t.archived);
  const todo = queue(view, ctx);
  const urgent = live.filter((t) => t.priority === "critical" || t.category === "urgent");
  const pending = view.tasks.filter((t) => t.status !== "completed");
  const confirmed = view.tasks.filter((t) => t.confirmed);
  const suggested = view.tasks.filter((t) => !t.confirmed && t.status !== "completed");
  const dueSoon = pending.filter((t) => t.due && Date.parse(`${t.due.date}T23:59:00Z`) - nowMs < 2 * 86_400_000);
  const todays = view.events.filter((e) => ymdIn(e.start, tz) === today);
  const proposals = view.proposals.filter((p) => p.status === "proposed" && p.kind !== "cancellation");
  const followups = view.followups.filter((f) => f.status === "open");
  const breakdown = CATS.map((c) => ({ c, n: live.filter((t) => t.category === c).length })).filter((x) => x.n > 0);
  const plan = agenda(view, tz);

  const summary = [urgent.length && `${urgent.length} urgent`, proposals.length && `${proposals.length} meeting request${proposals.length > 1 ? "s" : ""}`, suggested.length && `${suggested.length} suggested task${suggested.length > 1 ? "s" : ""}`, followups.length && `${followups.length} follow-up${followups.length > 1 ? "s" : ""}`].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <div className="-mx-4 -mt-6 lg:-mx-8">
        <ReconnectBar />
      </div>
      <AssistantOffer />
      <section className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-brand-soft via-surface to-surface p-6 shadow-card sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-violet-400/25 to-rose-400/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">{localTime(view.now, tz, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Good {hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}, {prefs.name.split(" ")[0]}
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] text-fg/80">
              {summary.length ? (
                <>
                  Across {view.accounts.length} mailbox{view.accounts.length === 1 ? "" : "es"}: <b>{summary.join(", ")}</b> are waiting for you.
                </>
              ) : (
                "You're all caught up. Nothing needs you right now."
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {review.length > 0 && (
              <Button size="md" className="rounded-full border-amber-300 bg-amber-50 px-5 text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100" onClick={() => navigate("/inbox?view=review")}>
                <MessageSquareWarning className="h-4 w-4" /> {review.length} need your review
              </Button>
            )}
            {todo[0] && (
              <Button variant="primary" size="md" className="rounded-full px-5" onClick={() => navigate(`/inbox?t=${encodeURIComponent(todo[0].key)}`)}>
                <Sparkles className="h-4 w-4" /> Triage next
              </Button>
            )}
            <Button size="md" className="rounded-full px-5" onClick={() => navigate("/inbox")}>
              <Inbox className="h-4 w-4" /> Open inbox
            </Button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Unread" value={view.counts.unread} hint="across all mailboxes" icon={Mail} cls="bg-brand-soft text-brand" onClick={() => navigate("/inbox?unread=1")} />
        <Tile label="Urgent" value={urgent.length} hint="need attention first" icon={AlertTriangle} cls="bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300" onClick={() => navigate("/inbox?view=urgent")} />
        <Tile label="Pending tasks" value={pending.length} hint={`${suggested.length} new from email, waiting for you`} icon={ListTodo} cls="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" onClick={() => navigate("/tasks")} />
        <Tile label="Due in 48 hours" value={dueSoon.length} hint={`${pending.filter((t) => t.overdue).length} overdue`} icon={Clock} cls="bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" onClick={() => navigate("/tasks")} />
        <Tile label="Meetings today" value={todays.length} hint={`${proposals.length} request${proposals.length === 1 ? "" : "s"} to answer`} icon={CalendarDays} cls="bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" onClick={() => navigate("/calendar")} />
        <Tile label="Follow-ups" value={followups.length} hint="replies and promises due" icon={Hourglass} cls="bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300" onClick={() => navigate("/follow-ups")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card title="Needs you now" action="Open inbox" onAction={() => navigate("/inbox?sort=priority")} className="lg:col-span-7">
          <ul className="mt-2 px-2 pb-2">
            {todo.slice(0, 7).map((t) => {
              const last = view.messages.find((m) => m.id === t.message_ids.at(-1))!;
              const lead = [...t.message_ids].reverse().map((id) => view.insights[id]).find(Boolean);
              const acc = view.accounts.find((a) => a.id === t.account_id)!;
              return (
                <li key={t.key}>
                  <button onClick={() => navigate(`/inbox?t=${encodeURIComponent(t.key)}`)} className="group relative flex w-full items-center gap-3 rounded-xl py-2.5 pl-4 pr-3 text-left hover:bg-subtle">
                    <span className={cn("absolute inset-y-2 left-1 w-1 rounded-full", CAT[t.category].stripe)} />
                    <ProviderMark provider={acc.provider} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn("truncate text-sm", t.unread ? "font-semibold" : "font-medium")}>{t.subject}</span>
                        <PriorityBadge priority={t.priority} />
                      </div>
                      <div className="truncate text-xs text-muted">
                        {nameOf(last.from)} · {lead?.next_action}
                      </div>
                    </div>
                    <span className="hidden text-[11px] text-muted sm:block">{ago(t.last_at, view.now)}</span>
                    <CategoryBadge category={t.category} />
                  </button>
                </li>
              );
            })}
            {todo.length === 0 && <li className="px-3 py-10 text-center text-sm text-muted">You are all caught up.</li>}
          </ul>
        </Card>

        <Card title="Inbox breakdown" action="All mail" onAction={() => navigate("/inbox")} className="lg:col-span-5">
          <div className="flex flex-wrap items-center gap-4 px-5 pb-5 pt-3">
            <Donut data={breakdown} total={live.length} />
            <ul className="min-w-[10rem] flex-1 space-y-1">
              {breakdown.map(({ c, n }) => (
                <li key={c}>
                  <button onClick={() => navigate(`/inbox?view=${c}`)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-subtle">
                    <span className={cn("h-2.5 w-2.5 rounded-full", CAT[c].dot)} />
                    <span className="flex-1">{CAT[c].short}</span>
                    <span className="tabular-nums text-muted">{n}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card title="Agenda" action="Calendar" onAction={() => navigate("/calendar")} className="lg:col-span-5">
          <div className="space-y-4 px-5 pb-5 pt-2">
            {plan.map((g) => (
              <div key={g.day}>
                <div className="label-xs mb-1.5">{g.day}</div>
                <ul className="space-y-1.5">
                  {g.items.map((e) => (
                    <li key={e.id}>
                      <button
                        onClick={() => (e.thread ? navigate(`/inbox?t=${encodeURIComponent(e.thread)}`) : navigate("/calendar"))}
                        className={cn("flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left transition hover:shadow-card", e.tentative ? "tentative border-dashed border-sky-300 dark:border-sky-500/40" : "border-line bg-surface")}
                      >
                        <span className="w-12 shrink-0 pt-0.5 text-xs font-semibold tabular-nums">{localTime(e.start, tz, { hour: "2-digit", minute: "2-digit" })}</span>
                        <span className={cn("mt-1 h-8 w-1 shrink-0 rounded-full", e.tentative ? "bg-sky-300" : e.simulated ? "bg-amber-400" : "bg-sky-500")} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{e.title}</span>
                          <span className="block text-xs text-muted">
                            {e.tentative ? "Request: answer needed" : e.end ? `until ${localTime(e.end, tz, { hour: "2-digit", minute: "2-digit" })}` : ""}
                            {e.simulated ? " · demo calendar" : ""}
                          </span>
                          {e.conflicts.length > 0 && <span className="mt-0.5 block text-xs font-medium text-rose-600">Clashes with {e.conflicts.join(", ")}</span>}
                        </span>
                        {e.link && <Video className="mt-0.5 h-4 w-4 shrink-0 text-muted" />}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {plan.length === 0 && <p className="py-6 text-center text-sm text-muted">Nothing scheduled.</p>}
          </div>
        </Card>

        <Card title="Tasks" action="All tasks" onAction={() => navigate("/tasks")} className="lg:col-span-4">
          <div className="flex items-center gap-3 px-5 pt-2">
            <Ring done={confirmed.filter((t) => t.status === "completed").length} total={confirmed.length} />
            <div className="text-xs text-muted">
              <div className="text-sm font-medium text-fg">
                {confirmed.filter((t) => t.status === "completed").length} of {confirmed.length} done
              </div>
              {suggested.length} suggested from email
            </div>
          </div>
          <ul className="space-y-1 px-3 pb-4 pt-3">
            {pending.slice(0, 5).map((t) => (
              <li key={t.id}>
                <button onClick={() => navigate("/tasks")} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-subtle">
                  <span className={cn("h-4 w-4 shrink-0 rounded-full border-2", t.overdue ? "border-rose-500" : t.confirmed ? "border-brand" : "border-dashed border-muted")} />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px]", t.overdue ? "bg-rose-100 font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" : t.due ? "bg-subtle text-muted" : "text-muted")}>
                    {t.due ? formatDate(t.due.date).replace(/ \d{4}$/, "") : "no date"}
                  </span>
                </button>
              </li>
            ))}
            {pending.length === 0 && <li className="py-4 text-center text-sm text-muted">No pending tasks.</li>}
          </ul>
        </Card>

        <Card title="Follow-ups" action="All" onAction={() => navigate("/follow-ups")} className="lg:col-span-3">
          <ul className="space-y-1 px-3 pb-4 pt-2">
            {followups.slice(0, 5).map((f) => {
              const k = FU_ICON[f.kind];
              return (
                <li key={f.id}>
                  <button onClick={() => navigate(`/inbox?t=${encodeURIComponent(f.thread_key)}`)} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-subtle">
                    <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", k.cls)}>
                      <k.icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{f.title}</span>
                      <span className="block text-[11px] text-muted">{k.label}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {followups.length === 0 && <li className="py-4 text-center text-sm text-muted">Nothing to chase.</li>}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Mailboxes" action="Manage" onAction={() => navigate("/settings")}>
          <ul className="space-y-2 px-5 pb-5 pt-2">
            {view.accounts.map((a) => {
              const threads = view.threads.filter((t) => t.account_id === a.id && !t.archived);
              const mix = CATS.map((c) => ({ c, n: threads.filter((t) => t.category === c).length })).filter((x) => x.n);
              return (
                <li key={a.id}>
                  <button onClick={() => navigate(`/inbox?account=${encodeURIComponent(a.id)}`)} className="w-full rounded-xl border border-line p-3 text-left transition hover:shadow-card">
                    <div className="flex items-center gap-3">
                      <ProviderMark provider={a.provider} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{a.address}</div>
                        <div className="text-xs text-muted">
                          {accountNote(a)} · {threads.length} conversations
                        </div>
                      </div>
                      <span className="text-right text-xs text-muted">
                        <span className="block text-base font-semibold tabular-nums text-fg">{threads.reduce((n, t) => n + t.unread, 0)}</span>
                        unread
                      </span>
                    </div>
                    <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-subtle">
                      {mix.map(({ c, n }) => (
                        <span key={c} className={CAT[c].dot} style={{ width: `${(n / (threads.length || 1)) * 100}%` }} title={`${CAT[c].short}: ${n}`} />
                      ))}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title="Recent activity">
          <ol className="relative ml-5 mr-5 mt-3 space-y-3 border-l border-line pb-5 pl-4">
            {[...state.audit]
              .reverse()
              .slice(0, 7)
              .map((e, i) => (
                <li key={i} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand" />
                  <span className="block truncate">{e.detail}</span>
                  <span className="text-xs text-muted">
                    {e.actor} · {localTime(e.at, tz, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                  </span>
                </li>
              ))}
            {state.audit.length === 0 && <li className="text-sm text-muted">Nothing yet. Actions you take appear here.</li>}
          </ol>
        </Card>
      </div>
    </div>
  );
}
