import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Bell, Check, Columns3, GripVertical, List, Mail, Plus, Sparkles, User } from "lucide-react";
import { addManualTask, addReminder, formatDate, offsetLabel, updateTask, type MailTaskStatus, type MailboxView, type TaskItem } from "@c16/core";
import { useApp } from "../store/app";
import { useMailbox, useMailboxView } from "../store/mailbox";
import { Badge, Button, EmptyState, Segmented, cn } from "../ui";
import { PRIORITY_TONE, ProviderMark, nameOf, ymdIn } from "../components/mail/common";

type Tab = "pending" | "in_progress" | "completed" | "overdue" | "suggested";
type Column = "suggested" | MailTaskStatus;
const now = () => new Date().toISOString();
const COLUMNS: { id: Column; label: string; hint: string; dot: string }[] = [
  { id: "suggested", label: "Suggested from email", hint: "Found in your mail. Add the ones you'll do.", dot: "bg-violet-500" },
  { id: "pending", label: "Pending", hint: "On your list, not started.", dot: "bg-slate-400" },
  { id: "in_progress", label: "In progress", hint: "Being worked on.", dot: "bg-sky-500" },
  { id: "completed", label: "Completed", hint: "Done.", dot: "bg-emerald-500" },
];

function dueChip(t: TaskItem, view: MailboxView, tz: string) {
  if (!t.due) return { text: t.due_note ?? "No due date", cls: t.due_note ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" : "bg-subtle text-muted" };
  const today = ymdIn(view.now, tz);
  const text = `${formatDate(t.due.date).replace(/ \d{4}$/, "")}${t.due.time ? ` · ${t.due.time}` : ""}`;
  if (t.status === "completed") return { text, cls: "bg-subtle text-muted line-through" };
  if (t.overdue) return { text: `Overdue · ${text}`, cls: "bg-rose-600 text-white" };
  if (t.due.date === today) return { text: `Today${t.due.time ? ` · ${t.due.time}` : ""}`, cls: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300" };
  return { text, cls: "bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300" };
}

export default function TasksPage() {
  const view = useMailboxView();
  const apply = useMailbox((s) => s.apply);
  const prefs = useApp((s) => s.prefs);
  const [params, setParams] = useSearchParams();
  const layout = params.get("layout") === "list" ? "list" : "board";
  const [tab, setTab] = useState<Tab>("pending");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [over, setOver] = useState<Column | null>(null);

  const groups: Record<Tab, TaskItem[]> = {
    suggested: view.tasks.filter((t) => !t.confirmed && t.status !== "completed"),
    pending: view.tasks.filter((t) => t.confirmed && t.status === "pending" && !t.overdue),
    in_progress: view.tasks.filter((t) => t.confirmed && t.status === "in_progress" && !t.overdue),
    overdue: view.tasks.filter((t) => t.confirmed && t.overdue && t.status !== "completed"),
    completed: view.tasks.filter((t) => t.status === "completed"),
  };
  const column = (c: Column) =>
    (c === "suggested" ? groups.suggested : view.tasks.filter((t) => t.confirmed && t.status === c)).sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.due?.date ?? "9999").localeCompare(b.due?.date ?? "9999"));
  const move = (id: string, to: Column) => {
    if (to === "suggested") return;
    apply((s) => updateTask(s, id, { status: to, confirmed: true }, prefs.name, now()), to === "completed" ? "Task completed" : `Moved to ${COLUMNS.find((c) => c.id === to)!.label}`);
  };
  const stats: [Tab, string, string][] = [
    ["pending", "Pending", "text-fg"],
    ["in_progress", "In progress", "text-sky-600"],
    ["overdue", "Overdue", "text-rose-600"],
    ["completed", "Completed", "text-emerald-600"],
    ["suggested", "Suggested", "text-violet-600"],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="mt-1 text-sm text-muted">Work found in your email becomes a suggestion. It joins your list only when you add it. Drag cards between columns.</p>
        </div>
        <Segmented
          value={layout}
          onChange={(v) => setParams(v === "list" ? { layout: "list" } : {})}
          options={[
            { value: "board", label: <><Columns3 className="h-3.5 w-3.5" /> Board</> },
            { value: "list", label: <><List className="h-3.5 w-3.5" /> List</> },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map(([k, label, cls]) => (
          <button
            key={k}
            onClick={() => {
              setTab(k);
              setParams({ layout: "list" });
            }}
            className="rounded-2xl border border-line bg-surface px-4 py-3 text-left shadow-card transition hover:shadow-pop"
          >
            <div className={cn("text-2xl font-semibold tabular-nums", cls)}>{groups[k].length}</div>
            <div className="text-xs text-muted">{label}</div>
          </button>
        ))}
      </div>

      <form
        className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-2 pl-4 shadow-card focus-within:border-brand/50"
        onSubmit={(e) => {
          e.preventDefault();
          if (apply((s) => addManualTask(s, { title, due_date: due || undefined, due_time: dueTime || null, timezone: prefs.timezone }, prefs.name, now()), "Task added")) {
            setTitle("");
            setDue("");
            setDueTime("");
          }
        }}
      >
        <Plus className="h-4 w-4 text-muted" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task, e.g. Send the vendor list to Priya" aria-label="New task title" className="min-w-[12rem] flex-1 bg-transparent text-sm outline-none" />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className="field h-8" />
        <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} aria-label="Due time" className="field h-8" />
        <Button size="sm" variant="primary" className="rounded-full px-4" disabled={!title.trim()}>
          Add
        </Button>
      </form>

      {layout === "board" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((c) => {
            const items = column(c.id);
            return (
              <section
                key={c.id}
                onDragOver={(e) => {
                  if (c.id === "suggested") return;
                  e.preventDefault();
                  setOver(c.id);
                }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  move(e.dataTransfer.getData("text/plain"), c.id);
                }}
                className={cn("flex min-h-[16rem] flex-col rounded-2xl border p-3 transition", c.id === "suggested" ? "border-dashed border-violet-300 bg-violet-50/40 dark:border-violet-500/30 dark:bg-violet-500/5" : "border-line bg-subtle/60", over === c.id && "border-brand bg-brand-soft/40")}
              >
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className={cn("h-2.5 w-2.5 rounded-full", c.dot)} />
                  <h2 className="text-sm font-semibold">{c.label}</h2>
                  <span className="rounded-full bg-surface px-2 text-xs tabular-nums text-muted shadow-card">{items.length}</span>
                </div>
                <div className="flex-1 space-y-2">
                  {items.map((t) => (
                    <BoardCard key={t.id} t={t} view={view} />
                  ))}
                  {items.length === 0 && <p className="px-1 py-6 text-center text-xs text-muted">{c.hint}</p>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <>
          <Segmented
            value={tab}
            onChange={setTab}
            options={(
              [
                ["pending", "Pending"],
                ["in_progress", "In progress"],
                ["overdue", "Overdue"],
                ["completed", "Completed"],
                ["suggested", "Suggested from email"],
              ] as [Tab, string][]
            ).map(([value, label]) => ({ value, label: `${label} ${groups[value].length}` }))}
          />
          <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            {groups[tab].length === 0 ? (
              <EmptyState icon={<Check />} title="Nothing here">
                {tab === "suggested" ? "No new tasks found in your email." : "No tasks in this list."}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {groups[tab].map((t) => (
                  <li key={t.id} className="px-4 py-1">
                    <BoardCard t={t} view={view} flat />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function BoardCard({ t, view, flat }: { t: TaskItem; view: MailboxView; flat?: boolean }) {
  const apply = useMailbox((s) => s.apply);
  const prefs = useApp((s) => s.prefs);
  const navigate = useNavigate();
  const chip = dueChip(t, view, prefs.timezone);
  const msg = t.source.message_id ? view.messages.find((m) => m.id === t.source.message_id) : undefined;
  const acc = msg ? view.accounts.find((a) => a.id === msg.account_id) : undefined;
  const done = t.status === "completed";
  return (
    <article
      draggable={!flat}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", t.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn("group relative", flat ? "py-3" : cn("cursor-grab rounded-xl border bg-surface p-3 shadow-card transition hover:shadow-pop active:cursor-grabbing", t.overdue && !done ? "border-rose-300 dark:border-rose-500/40" : "border-line"))}
    >
      {!flat && <GripVertical className="absolute right-2 top-3 h-4 w-4 text-muted/0 group-hover:text-muted/60" />}
      <div className="flex items-start gap-2.5">
        <button
          onClick={() => apply((s) => updateTask(s, t.id, { status: done ? "pending" : "completed", confirmed: true }, prefs.name, now()), done ? "Task reopened" : "Task completed")}
          aria-label={done ? "Reopen task" : "Complete task"}
          className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition", done ? "border-emerald-500 bg-emerald-500 text-white" : "border-line hover:border-emerald-500 hover:bg-emerald-50")}
        >
          {done && <Check className="h-3 w-3" />}
        </button>
        <div className="min-w-0 flex-1 pr-4">
          <div className={cn("text-sm font-medium leading-snug", done && "text-muted line-through")}>{t.title}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", chip.cls)}>{chip.text}</span>
            {t.due && <span className="text-[10px] text-muted">UTC{offsetLabel(t.due.tz_offset)}</span>}
            {t.priority !== "normal" && t.priority !== "low" && (
              <Badge tone={PRIORITY_TONE[t.priority]} className="rounded-full">
                {t.priority}
              </Badge>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {t.owner !== null ? (
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" /> {t.owner}
              </span>
            ) : (
              t.origin === "extracted" && <span className="text-amber-700 dark:text-amber-300">No confirmed owner</span>
            )}
            {msg && acc && (
              <button onClick={() => navigate(`/inbox?t=${encodeURIComponent(t.source.thread_key)}`)} className="inline-flex min-w-0 items-center gap-1 text-brand hover:underline">
                <ProviderMark provider={acc.provider} size="xs" /> <span className="truncate">from {nameOf(msg.from)}</span>
              </button>
            )}
            {t.origin === "manual" && (
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3 w-3" /> added by you
              </span>
            )}
          </div>
          {t.due?.needs_confirmation.map((n) => (
            <div key={n} className="mt-1.5 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" /> Please confirm: {n}
            </div>
          ))}
          {t.source.quote && <p className="mt-1.5 line-clamp-2 border-l-2 border-line pl-2 text-xs italic text-muted">"{t.source.quote}"</p>}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {t.confirmed ? (
              <>
                <select value={t.status} onChange={(e) => apply((s) => updateTask(s, t.id, { status: e.target.value as MailTaskStatus }, prefs.name, now()))} aria-label="Status" className="field h-7">
                  <option value="pending">Pending</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
                {t.due && !done && (
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-label="Remind me a day before"
                    title="Remind me a day before"
                    onClick={() => {
                      const at = new Date(Date.parse(`${t.due!.date}T${t.due!.time ?? "09:00"}:00${offsetLabel(t.due!.tz_offset)}`) - 86_400_000).toISOString();
                      apply((s) => addReminder(s, { kind: "task", id: t.id }, at, `Due tomorrow: ${t.title}`, prefs.name, now()), "Reminder set for a day before");
                    }}
                  >
                    <Bell className="h-3.5 w-3.5" />
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button size="xs" variant="primary" className="rounded-full" onClick={() => apply((s) => updateTask(s, t.id, { confirmed: true }, prefs.name, now()), "Added to tasks")}>
                  <Sparkles className="h-3 w-3" /> Add
                </Button>
                <Button size="xs" variant="ghost" onClick={() => apply((s) => updateTask(s, t.id, { dismissed: true }, prefs.name, now()), "Suggestion dismissed")}>
                  Dismiss
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
