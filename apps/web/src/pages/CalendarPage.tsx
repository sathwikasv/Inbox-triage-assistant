import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CalendarDays, ChevronLeft, ChevronRight, Loader2, Mail, MapPin, Trash2, Video } from "lucide-react";
import { completeReminder, removeEvent, setEventReminders } from "@c16/core";
import { useApp } from "../store/app";
import { useMailbox, useMailboxView } from "../store/mailbox";
import { CALENDAR_PROVIDERS } from "../lib/providers";
import { ProposalCard } from "../components/mail/ThreadView";
import { localTime } from "../components/mail/common";
import { Badge, Button, Tip, cn } from "../ui";

const ymd = (ms: number, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

export default function CalendarPage() {
  const view = useMailboxView();
  const { apply, connectCalendar, calendars, busy, state } = useMailbox();
  const prefs = useApp((s) => s.prefs);
  const navigate = useNavigate();
  const [week, setWeek] = useState(0);
  const tz = prefs.timezone;
  const start = Date.parse(view.now) + week * 7 * 86_400_000;
  const days = Array.from({ length: 7 }, (_, i) => start + i * 86_400_000);
  const today = ymd(Date.parse(view.now), tz);
  const proposals = view.proposals.filter((p) => p.status === "proposed");
  const own = new Set(state.events.map((e) => e.id));
  const reminders = view.reminders.filter((r) => !r.done).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="mt-1 text-sm text-muted">Meeting requests from email wait here until you accept them. Nothing is added without your confirmation.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["google", "outlook"] as const).map((c) => {
            const client = CALENDAR_PROVIDERS[c];
            const link = calendars.find((x) => x.calendar === c);
            const need = client.setupNeeded();
            return link ? (
              <Badge key={c} tone="green">
                {client.label}: {link.address}
              </Badge>
            ) : (
              <Tip key={c} content={need ?? `Connect ${client.label} (separate permission from mail)`}>
                <span>
                  <Button size="sm" disabled={!!need || busy[`calendar:${c}`]} onClick={() => connectCalendar(c)}>
                    {busy[`calendar:${c}`] ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />} Connect {client.label}
                  </Button>
                </span>
              </Tip>
            );
          })}
        </div>
      </div>
      {calendars.length === 0 && <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">No calendar connected: events you accept go to a demo calendar kept in this browser.</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <Button size="icon" variant="ghost" onClick={() => setWeek((w) => w - 1)} aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold">
              {localTime(new Date(days[0]).toISOString(), tz, { day: "numeric", month: "short" })} – {localTime(new Date(days[6]).toISOString(), tz, { day: "numeric", month: "short", year: "numeric" })}
            </span>
            <Button size="icon" variant="ghost" onClick={() => setWeek((w) => w + 1)} aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </Button>
            {week !== 0 && (
              <Button size="xs" variant="ghost" onClick={() => setWeek(0)}>
                This week
              </Button>
            )}
          </div>
          <div className="grid divide-y divide-line md:grid-cols-7 md:divide-x md:divide-y-0">
            {days.map((d) => {
              const key = ymd(d, tz);
              const events = view.events.filter((e) => ymd(Date.parse(e.start), tz) === key);
              return (
                <div key={key} className={cn("min-h-[9rem] p-2", key === today && "bg-brand-soft/40")}>
                  <div className={cn("mb-2 text-xs font-semibold", key === today ? "text-brand" : "text-muted")}>{localTime(new Date(d).toISOString(), tz, { weekday: "short", day: "numeric" })}</div>
                  <div className="space-y-1.5">
                    {events.map((e) => (
                      <div key={e.id} className={cn("group rounded-lg border-l-[3px] bg-surface p-2 text-xs shadow-card", e.simulated ? "border-amber-400" : e.calendar === "outlook" ? "border-sky-600" : "border-rose-500")}>
                        <div className="font-semibold leading-snug">{e.title}</div>
                        <div className="mt-0.5 text-muted">{e.all_day ? "All day" : `${localTime(e.start, tz, { hour: "2-digit", minute: "2-digit" })}–${localTime(e.end, tz, { hour: "2-digit", minute: "2-digit" })}`}</div>
                        {e.location && (
                          <div className="mt-0.5 flex items-center gap-1 text-muted">
                            <MapPin className="h-3 w-3" /> {e.location}
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-1.5 text-muted">
                          {e.link && (
                            <a href={e.link} target="_blank" rel="noreferrer noopener" aria-label="Join link" className="hover:text-brand">
                              <Video className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {e.source_message_id && (
                            <button onClick={() => navigate(`/inbox?t=${encodeURIComponent(view.insights[e.source_message_id!]?.thread_key ?? "")}`)} aria-label="Source email" className="hover:text-brand">
                              <Mail className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {own.has(e.id) && (
                            <>
                              <select value={e.reminders_min[0] ?? 0} onChange={(ev) => apply((s) => setEventReminders(s, e.id, Number(ev.target.value) ? [Number(ev.target.value)] : [], prefs.name, new Date().toISOString()), "Reminder updated")} aria-label="Reminder" className="rounded border border-line bg-surface px-0.5 text-[10px]">
                                <option value={0}>no reminder</option>
                                <option value={10}>10 min</option>
                                <option value={15}>15 min</option>
                                <option value={30}>30 min</option>
                                <option value={60}>1 hour</option>
                                <option value={1440}>1 day</option>
                              </select>
                              {e.simulated && (
                                <button onClick={() => apply((s) => removeEvent(s, e.id, prefs.name, new Date().toISOString()), "Event removed")} aria-label="Remove event" className="ml-auto opacity-0 hover:text-rose-600 group-hover:opacity-100">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                        {e.simulated && <div className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">demo calendar</div>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="space-y-4">
          <div>
            <h2 className="mb-2 text-sm font-semibold">Requests to answer ({proposals.length})</h2>
            <div className="space-y-3">
              {proposals.map((p) => (
                <ProposalCard key={p.id} view={view} proposal={p} />
              ))}
              {proposals.length === 0 && <p className="text-sm text-muted">No meeting requests waiting.</p>}
            </div>
          </div>
          <div className="card p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Bell className="h-4 w-4 text-muted" /> Reminders
            </h2>
            <ul className="mt-2 space-y-2">
              {reminders.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{r.note}</span>
                    <span className="text-xs text-muted">{localTime(r.at, tz)}</span>
                  </span>
                  <Button size="xs" variant="ghost" onClick={() => apply((s) => completeReminder(s, r.id), "Reminder done")}>
                    Done
                  </Button>
                </li>
              ))}
              {reminders.length === 0 && <li className="text-sm text-muted">Set reminders on tasks and events.</li>}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
