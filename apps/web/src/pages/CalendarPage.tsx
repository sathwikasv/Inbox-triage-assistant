import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, CalendarDays, ChevronLeft, ChevronRight, Clock, Loader2, Mail, MapPin, Trash2, Users, Video } from "lucide-react";
import { completeReminder, removeEvent, setEventReminders, type CalendarEvent, type EventProposal, type MailboxView } from "@c16/core";
import { useApp } from "../store/app";
import { useMailbox, useMailboxView } from "../store/mailbox";
import { CALENDAR_PROVIDERS } from "../lib/providers";
import { ProposalCard } from "../components/mail/ThreadView";
import { localTime, minutesIn, whenIso, ymdIn } from "../components/mail/common";
import { Badge, Button, Dialog, Segmented, Tip, cn } from "../ui";

const START = 7; // first hour shown
const END = 21; // last hour shown
const HOUR = 64; // px per hour
const DAY = 86_400_000;

interface Block {
  id: string;
  title: string;
  start: string;
  end: string;
  tentative: boolean;
  event?: CalendarEvent;
  proposal?: EventProposal;
  clash: boolean;
  col: number;
  cols: number;
}

/** Side-by-side columns for overlapping blocks in one day, as calendar apps do. */
function layout(items: Omit<Block, "col" | "cols">[]): Block[] {
  const sorted = [...items].sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || Date.parse(b.end) - Date.parse(a.end));
  const out: Block[] = [];
  let cluster: Block[] = [];
  let colEnds: number[] = [];
  let clusterEnd = 0;
  const flush = () => {
    for (const b of cluster) b.cols = colEnds.length;
    out.push(...cluster);
    cluster = [];
    colEnds = [];
  };
  for (const it of sorted) {
    const s = Date.parse(it.start);
    const e = Date.parse(it.end);
    if (cluster.length && s >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= s);
    if (col < 0) {
      col = colEnds.length;
      colEnds.push(e);
    } else colEnds[col] = e;
    clusterEnd = Math.max(clusterEnd, e);
    cluster.push({ ...it, col, cols: 1 });
  }
  flush();
  for (const b of out) b.clash = b.clash || out.some((o) => o !== b && Date.parse(o.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(o.end) && !(o.tentative && b.tentative));
  return out;
}

const colour = (b: Block) =>
  b.tentative
    ? "tentative border-sky-400 text-sky-900 dark:text-sky-100"
    : b.event?.source_message_id
      ? "border-violet-500 bg-violet-100 text-violet-950 dark:bg-violet-500/20 dark:text-violet-100"
      : b.event?.calendar === "google"
        ? "border-rose-500 bg-rose-100 text-rose-950 dark:bg-rose-500/20 dark:text-rose-100"
        : b.event?.calendar === "outlook"
          ? "border-blue-600 bg-blue-100 text-blue-950 dark:bg-blue-500/20 dark:text-blue-100"
          : "border-sky-500 bg-sky-100 text-sky-950 dark:bg-sky-500/20 dark:text-sky-100";

export default function CalendarPage() {
  const view = useMailboxView();
  const { connectCalendar, calendars, busy, apply } = useMailbox();
  const prefs = useApp((s) => s.prefs);
  const [week, setWeek] = useState(0);
  const [mode, setMode] = useState<"week" | "agenda">("week");
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const tz = prefs.timezone;
  const nowMs = Date.parse(view.now);
  const start = nowMs + week * 7 * DAY;
  const days = Array.from({ length: 7 }, (_, i) => start + i * DAY);
  const today = ymdIn(nowMs, tz);
  const proposals = view.proposals.filter((p) => p.status === "proposed");
  const reminders = view.reminders.filter((r) => !r.done).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  useEffect(() => {
    scroller.current?.scrollTo({ top: Math.max(0, (minutesIn(nowMs, tz) / 60 - START - 1) * HOUR) });
  }, [nowMs, tz, mode]);

  const blocksFor = (key: string) =>
    layout([
      ...view.events.filter((e) => !e.all_day && ymdIn(e.start, tz) === key).map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, tentative: false, event: e, clash: false })),
      ...proposals
        .filter((p) => p.kind !== "cancellation" && p.when?.time)
        .map((p) => {
          const s = whenIso(p.when!.date, p.when!.time!, p.when!.tz_offset);
          const end = p.when!.end_time ? whenIso(p.when!.date, p.when!.end_time, p.when!.tz_offset) : new Date(Date.parse(s) + (p.duration_min ?? 30) * 60_000).toISOString();
          return { id: p.id, title: p.title, start: s, end, tentative: true, proposal: p, clash: p.conflicts.length > 0 };
        })
        .filter((b) => ymdIn(b.start, tz) === key),
    ]);
  const allDay = (key: string) => view.events.filter((e) => e.all_day && ymdIn(e.start, tz) === key);
  const showProposal = (id: string) => {
    setFocus(id);
    document.getElementById(`proposal-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setFocus(null), 1600);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="mt-1 text-sm text-muted">Meeting requests from email appear striped until you answer them. Nothing is added without your confirmation.</p>
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
                  <Button size="sm" className="rounded-full" disabled={!!need || busy[`calendar:${c}`]} onClick={() => connectCalendar(c)}>
                    {busy[`calendar:${c}`] ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />} Connect {client.label}
                  </Button>
                </span>
              </Tip>
            );
          })}
        </div>
      </div>
      {calendars.length === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" /> No calendar connected: events you accept go to a demo calendar kept in this browser.
        </div>
      )}

      <div className="grid gap-4">
        <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
            <Button size="sm" className="rounded-full" onClick={() => setWeek(0)} disabled={week === 0}>
              Today
            </Button>
            <Button size="icon" variant="ghost" className="rounded-full" onClick={() => setWeek((w) => w - 1)} aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="rounded-full" onClick={() => setWeek((w) => w + 1)} aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-base font-medium">
              {localTime(new Date(days[0]).toISOString(), tz, { day: "numeric", month: "short" })} – {localTime(new Date(days[6]).toISOString(), tz, { day: "numeric", month: "short", year: "numeric" })}
            </span>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden items-center gap-3 text-[11px] text-muted lg:flex">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-sky-400" /> calendar
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-violet-500" /> from email
                </span>
                <span className="flex items-center gap-1">
                  <span className="tentative h-2.5 w-2.5 rounded-sm border border-dashed border-sky-400" /> request
                </span>
              </span>
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: "week", label: "Week" },
                  { value: "agenda", label: "Agenda" },
                ]}
              />
            </div>
          </div>

          {mode === "week" ? (
            <div ref={scroller} className="max-h-[68vh] overflow-auto">
              <div className="min-w-[48rem]">
                <div className="sticky top-0 z-10 grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-line bg-surface">
                  <div />
                  {days.map((d) => {
                    const key = ymdIn(d, tz);
                    return (
                      <div key={key} className="border-l border-line px-2 py-2 text-center">
                        <div className={cn("text-[11px] font-medium uppercase", key === today ? "text-brand" : "text-muted")}>{localTime(new Date(d).toISOString(), tz, { weekday: "short" })}</div>
                        <div className={cn("mx-auto mt-0.5 grid h-8 w-8 place-items-center rounded-full text-lg", key === today ? "bg-brand font-semibold text-brand-fg" : "text-fg")}>{Number(key.slice(8, 10))}</div>
                        {allDay(key).map((e) => (
                          <button key={e.id} onClick={() => setOpenEvent(e)} className="mt-1 block w-full truncate rounded bg-sky-100 px-1 text-left text-[11px] text-sky-900 dark:bg-sky-500/20 dark:text-sky-100">
                            {e.title}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <div className="relative grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]" style={{ height: (END - START) * HOUR }}>
                  <div className="relative">
                    {Array.from({ length: END - START }, (_, i) => (
                      <span key={i} className="absolute right-2 -translate-y-1/2 text-[10px] text-muted" style={{ top: i * HOUR }}>
                        {i === 0 ? "" : `${String(START + i).padStart(2, "0")}:00`}
                      </span>
                    ))}
                  </div>
                  {days.map((d) => {
                    const key = ymdIn(d, tz);
                    const blocks = blocksFor(key);
                    return (
                      <div key={key} className={cn("relative border-l border-line", key === today && "bg-brand-soft/20")} style={{ backgroundImage: `repeating-linear-gradient(to bottom, rgb(var(--line)) 0 1px, transparent 1px ${HOUR}px)` }}>
                        {key === today && (
                          <div className="absolute inset-x-0 z-[3] flex items-center" style={{ top: ((minutesIn(nowMs, tz) - START * 60) / 60) * HOUR }}>
                            <span className="-ml-1.5 h-3 w-3 rounded-full bg-rose-500" />
                            <span className="h-0.5 flex-1 bg-rose-500" />
                          </div>
                        )}
                        {blocks.map((b) => {
                          const sMin = Math.max(minutesIn(b.start, tz), START * 60);
                          const eMin = Math.min(Math.max(minutesIn(b.end, tz), sMin + 25), END * 60);
                          const h = ((eMin - sMin) / 60) * HOUR;
                          return (
                            <button
                              key={b.id}
                              onClick={() => (b.event ? setOpenEvent(b.event) : showProposal(b.id))}
                              className={cn("absolute z-[2] overflow-hidden rounded-lg border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition hover:z-[4] hover:shadow-pop", colour(b), b.clash && "ring-2 ring-rose-500", b.tentative && "border border-l-4 border-dashed")}
                              style={{ top: ((sMin - START * 60) / 60) * HOUR + 1, height: h - 2, left: `calc(${(b.col / b.cols) * 100}% + 2px)`, width: `calc(${100 / b.cols}% - 4px)` }}
                              title={b.clash ? "Clashes with another event" : undefined}
                            >
                              <div className="truncate font-semibold">{b.title}</div>
                              <div className="truncate opacity-80">
                                {b.tentative ? "Request · " : ""}
                                {localTime(b.start, tz, { hour: "2-digit", minute: "2-digit" })}–{localTime(b.end, tz, { hour: "2-digit", minute: "2-digit" })}
                              </div>
                              {b.clash && h > 44 && <div className="mt-0.5 font-semibold text-rose-600 dark:text-rose-300">clash</div>}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <Agenda view={view} days={days} tz={tz} onOpen={setOpenEvent} onProposal={showProposal} />
          )}
        </section>

        <aside className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              Requests to answer <span className="rounded-full bg-sky-100 px-2 text-xs text-sky-800 dark:bg-sky-500/15 dark:text-sky-200">{proposals.length}</span>
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {proposals.map((p) => (
                <div key={p.id} className={cn("rounded-2xl transition", focus === p.id && "ring-4 ring-brand/40")}>
                  <ProposalCard view={view} proposal={p} />
                </div>
              ))}
              {proposals.length === 0 && <p className="rounded-2xl border border-dashed border-line p-4 text-center text-sm text-muted">No meeting requests waiting.</p>}
            </div>
          </div>
          <div className="h-fit rounded-2xl border border-line bg-surface p-4 shadow-card lg:mt-7">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Bell className="h-4 w-4 text-amber-500" /> Reminders
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
      <EventDialog event={openEvent} view={view} onClose={() => setOpenEvent(null)} />
    </div>
  );
}

function Agenda({ view, days, tz, onOpen, onProposal }: { view: MailboxView; days: number[]; tz: string; onOpen: (e: CalendarEvent) => void; onProposal: (id: string) => void }) {
  const keys = days.map((d) => ymdIn(d, tz));
  return (
    <ul className="divide-y divide-line">
      {keys.map((key, i) => {
        const events = view.events.filter((e) => ymdIn(e.start, tz) === key).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
        const reqs = view.proposals.filter((p) => p.status === "proposed" && p.when?.time && ymdIn(whenIso(p.when.date, p.when.time, p.when.tz_offset), tz) === key);
        return (
          <li key={key} className="flex gap-4 px-4 py-3">
            <div className="w-16 shrink-0 text-center">
              <div className="text-[11px] uppercase text-muted">{localTime(new Date(days[i]).toISOString(), tz, { weekday: "short" })}</div>
              <div className="text-xl font-semibold">{Number(key.slice(8, 10))}</div>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {events.map((e) => (
                <button key={e.id} onClick={() => onOpen(e)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-subtle">
                  <span className={cn("h-2.5 w-2.5 rounded-full", e.source_message_id ? "bg-violet-500" : "bg-sky-500")} />
                  <span className="w-28 shrink-0 text-xs text-muted">{e.all_day ? "All day" : `${localTime(e.start, tz, { hour: "2-digit", minute: "2-digit" })}–${localTime(e.end, tz, { hour: "2-digit", minute: "2-digit" })}`}</span>
                  <span className="truncate font-medium">{e.title}</span>
                </button>
              ))}
              {reqs.map((p) => (
                <button key={p.id} onClick={() => onProposal(p.id)} className="tentative flex w-full items-center gap-3 rounded-lg border border-dashed border-sky-300 px-2 py-1.5 text-left text-sm">
                  <span className="h-2.5 w-2.5 rounded-full border-2 border-sky-500" />
                  <span className="w-28 shrink-0 text-xs text-muted">{p.when!.time} (request)</span>
                  <span className="truncate font-medium">{p.title}</span>
                  {p.conflicts.length > 0 && <span className="ml-auto shrink-0 text-xs font-medium text-rose-600">clash</span>}
                </button>
              ))}
              {events.length + reqs.length === 0 && <span className="text-sm text-muted">Nothing planned</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function EventDialog({ event, view, onClose }: { event: CalendarEvent | null; view: MailboxView; onClose: () => void }) {
  const { apply, state } = useMailbox();
  const prefs = useApp((s) => s.prefs);
  const navigate = useNavigate();
  if (!event) return null;
  const own = state.events.some((e) => e.id === event.id);
  const tz = prefs.timezone;
  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()} title={event.title} description={event.simulated ? "Demo calendar: changes stay in this browser." : `${event.calendar === "google" ? "Google" : "Outlook"} Calendar`}>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted" />
          {event.all_day ? `${localTime(event.start, tz, { weekday: "long", day: "numeric", month: "long" })} · all day` : `${localTime(event.start, tz, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} – ${localTime(event.end, tz, { hour: "2-digit", minute: "2-digit" })}`}
        </div>
        {event.location && (
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted" /> {event.location}
          </div>
        )}
        {event.link && (
          <a href={event.link} target="_blank" rel="noreferrer noopener" className="flex items-center gap-2 text-brand hover:underline">
            <Video className="h-4 w-4" /> Join the meeting
          </a>
        )}
        {event.participants.length > 0 && (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted" /> {event.participants.map((p) => p.name ?? p.email).join(", ")}
          </div>
        )}
        {own && (
          <label className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted" />
            <select
              value={event.reminders_min[0] ?? 0}
              onChange={(ev) => apply((s) => setEventReminders(s, event.id, Number(ev.target.value) ? [Number(ev.target.value)] : [], prefs.name, new Date().toISOString()), "Reminder updated")}
              aria-label="Reminder"
              className="field"
            >
              <option value={0}>No reminder</option>
              <option value={10}>10 minutes before</option>
              <option value={15}>15 minutes before</option>
              <option value={30}>30 minutes before</option>
              <option value={60}>1 hour before</option>
              <option value={1440}>1 day before</option>
            </select>
          </label>
        )}
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {event.source_message_id && (
          <Button
            onClick={() => {
              onClose();
              navigate(`/inbox?t=${encodeURIComponent(view.insights[event.source_message_id!]?.thread_key ?? "")}`);
            }}
          >
            <Mail className="h-4 w-4" /> Source email
          </Button>
        )}
        {own && event.simulated && (
          <Button
            variant="danger"
            onClick={() => {
              apply((s) => removeEvent(s, event.id, prefs.name, new Date().toISOString()), "Event removed");
              onClose();
            }}
          >
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
        )}
      </div>
    </Dialog>
  );
}
