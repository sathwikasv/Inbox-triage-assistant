import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, CalendarDays, Clock, Inbox, ListTodo, Mail, Video } from "lucide-react";
import { formatDate } from "@c16/core";
import { useApp } from "../store/app";
import { useMailbox, useMailboxView } from "../store/mailbox";
import { CategoryBadge, ProviderMark, accountNote, localTime, nameOf } from "../components/mail/common";
import { Badge, cn } from "../ui";

function Tile({ label, value, hint, icon, tone, onClick }: { label: string; value: number; hint: string; icon: React.ReactNode; tone: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="card p-4 text-left transition hover:-translate-y-px hover:shadow-pop">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className={cn("grid h-7 w-7 place-items-center rounded-lg [&>svg]:h-4 [&>svg]:w-4", tone)}>{icon}</span>
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </button>
  );
}

export default function DashboardPage() {
  const view = useMailboxView();
  const audit = useMailbox((s) => s.state.audit);
  const prefs = useApp((s) => s.prefs);
  const navigate = useNavigate();
  const tz = prefs.timezone;
  const nowMs = Date.parse(view.now);
  const today = localTime(view.now, tz, { year: "numeric", month: "2-digit", day: "2-digit" });
  const hour = Number(localTime(view.now, tz, { hour: "2-digit", hour12: false }));

  const urgent = view.threads.filter((t) => !t.archived && (t.priority === "critical" || t.category === "urgent"));
  const needs = view.threads.filter((t) => !t.archived && ["urgent", "requires_action", "to_delegate", "meetings", "follow_up"].includes(t.category)).sort((a, b) => ["critical", "high", "normal", "low"].indexOf(a.priority) - ["critical", "high", "normal", "low"].indexOf(b.priority));
  const pending = view.tasks.filter((t) => t.status !== "completed");
  const dueSoon = pending.filter((t) => t.due && Date.parse(`${t.due.date}T23:59:00Z`) - nowMs < 2 * 86_400_000);
  const todays = view.events.filter((e) => localTime(e.start, tz, { year: "numeric", month: "2-digit", day: "2-digit" }) === today);
  const upcoming = view.events.filter((e) => Date.parse(e.end) >= nowMs).slice(0, 5);
  const proposals = view.proposals.filter((p) => p.status === "proposed" && p.kind !== "cancellation");
  const followups = view.followups.filter((f) => f.status === "open");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Good {hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}, {prefs.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted">{localTime(view.now, tz, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} · {view.accounts.length} mailbox{view.accounts.length === 1 ? "" : "es"}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Unread" value={view.counts.unread} hint="across all accounts" icon={<Mail />} tone="bg-brand/10 text-brand" onClick={() => navigate("/inbox")} />
        <Tile label="Urgent" value={urgent.length} hint="need attention first" icon={<AlertTriangle />} tone="bg-rose-500/10 text-rose-600" onClick={() => navigate("/inbox?view=urgent")} />
        <Tile label="Pending tasks" value={pending.length} hint={`${view.tasks.filter((t) => !t.confirmed && t.status !== "completed").length} new from email, waiting for you`} icon={<ListTodo />} tone="bg-amber-500/10 text-amber-600" onClick={() => navigate("/tasks")} />
        <Tile label="Due in 48 hours" value={dueSoon.length} hint={`${pending.filter((t) => t.overdue).length} overdue`} icon={<Clock />} tone="bg-orange-500/10 text-orange-600" onClick={() => navigate("/tasks")} />
        <Tile label="Meetings today" value={todays.length} hint={`${proposals.length} request${proposals.length === 1 ? "" : "s"} to answer`} icon={<CalendarDays />} tone="bg-sky-500/10 text-sky-600" onClick={() => navigate("/calendar")} />
        <Tile label="Follow-ups" value={followups.length} hint="replies and promises due" icon={<Inbox />} tone="bg-violet-500/10 text-violet-600" onClick={() => navigate("/follow-ups")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="card overflow-hidden lg:col-span-3">
          <div className="flex items-center border-b border-line px-5 py-3.5">
            <h2 className="text-sm font-semibold">Needs you now</h2>
            <button onClick={() => navigate("/inbox")} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
              Open inbox <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="divide-y divide-line">
            {needs.slice(0, 7).map((t) => {
              const last = view.messages.find((m) => m.id === t.message_ids.at(-1))!;
              const lead = [...t.message_ids].reverse().map((id) => view.insights[id]).find(Boolean);
              const acc = view.accounts.find((a) => a.id === t.account_id)!;
              return (
                <li key={t.key}>
                  <button onClick={() => navigate(`/inbox?t=${encodeURIComponent(t.key)}`)} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-subtle">
                    <ProviderMark provider={acc.provider} size="xs" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{t.subject}</span>
                        {t.priority === "critical" && <Badge tone="solidRed">critical</Badge>}
                      </div>
                      <div className="truncate text-xs text-muted">
                        {nameOf(last.from)} · {lead?.next_action}
                      </div>
                    </div>
                    <CategoryBadge category={t.category} />
                  </button>
                </li>
              );
            })}
            {needs.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">You are all caught up.</li>}
          </ul>
        </section>

        <div className="space-y-4 lg:col-span-2">
          <section className="card p-5">
            <div className="flex items-center">
              <h2 className="text-sm font-semibold">Upcoming</h2>
              <button onClick={() => navigate("/calendar")} className="ml-auto text-xs font-medium text-brand hover:underline">
                Calendar
              </button>
            </div>
            <ul className="mt-3 space-y-2.5">
              {proposals.slice(0, 2).map((p) => (
                <li key={p.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                  <span className="min-w-0 flex-1">
                    <button onClick={() => navigate(`/inbox?t=${encodeURIComponent(p.source.thread_key)}`)} className="truncate font-medium hover:text-brand">
                      {p.title}
                    </button>
                    <span className="block text-xs text-muted">Waiting for your answer{p.when ? ` · ${formatDate(p.when.date)}${p.when.time ? ` ${p.when.time}` : ""}` : ""}</span>
                  </span>
                </li>
              ))}
              {upcoming.map((e) => (
                <li key={e.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{e.title}</span>
                    <span className="block text-xs text-muted">
                      {e.all_day ? localTime(e.start, tz, { day: "numeric", month: "short" }) + " · all day" : localTime(e.start, tz)}
                      {e.simulated ? " · demo calendar" : ""}
                    </span>
                  </span>
                  {e.link && <Video className="mt-0.5 h-4 w-4 text-muted" />}
                </li>
              ))}
              {upcoming.length + proposals.length === 0 && <li className="text-sm text-muted">Nothing scheduled.</li>}
            </ul>
          </section>

          <section className="card p-5">
            <div className="flex items-center">
              <h2 className="text-sm font-semibold">Tasks due soon</h2>
              <button onClick={() => navigate("/tasks")} className="ml-auto text-xs font-medium text-brand hover:underline">
                Tasks
              </button>
            </div>
            <ul className="mt-3 space-y-2">
              {pending.slice(0, 4).map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <ListTodo className={cn("h-4 w-4", t.overdue ? "text-rose-500" : "text-muted")} />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className={cn("shrink-0 text-xs", t.overdue ? "font-medium text-rose-600" : "text-muted")}>{t.due ? formatDate(t.due.date).replace(/ \d{4}$/, "") : "no date"}</span>
                </li>
              ))}
              {pending.length === 0 && <li className="text-sm text-muted">No pending tasks.</li>}
            </ul>
          </section>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Mailboxes</h2>
          <ul className="mt-3 divide-y divide-line">
            {view.accounts.map((a) => {
              const threads = view.threads.filter((t) => t.account_id === a.id);
              return (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <ProviderMark provider={a.provider} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.address}</div>
                    <div className="text-xs text-muted">{accountNote(a)}</div>
                  </div>
                  <span className="text-xs text-muted">{threads.reduce((n, t) => n + t.unread, 0)} unread</span>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Recent activity</h2>
          <ul className="mt-3 space-y-2">
            {[...audit]
              .reverse()
              .slice(0, 7)
              .map((e, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="w-24 shrink-0 text-xs text-muted">{localTime(e.at, tz, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</span>
                  <span className="min-w-0 flex-1 truncate">{e.detail}</span>
                </li>
              ))}
            {audit.length === 0 && <li className="text-sm text-muted">Nothing yet. Actions you take appear here.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
