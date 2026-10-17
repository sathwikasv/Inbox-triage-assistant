import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, Check, Mail, Plus } from "lucide-react";
import { addManualTask, addReminder, formatDate, offsetLabel, updateTask, type MailTaskStatus, type TaskItem } from "@c16/core";
import { useApp } from "../store/app";
import { useMailbox, useMailboxView } from "../store/mailbox";
import { Badge, Button, EmptyState, Segmented, cn } from "../ui";
import { PRIORITY_TONE } from "../components/mail/common";

type Tab = "pending" | "in_progress" | "completed" | "overdue" | "suggested";
const now = () => new Date().toISOString();

export default function TasksPage() {
  const view = useMailboxView();
  const apply = useMailbox((s) => s.apply);
  const prefs = useApp((s) => s.prefs);
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("pending");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [dueTime, setDueTime] = useState("");

  const groups: Record<Tab, TaskItem[]> = {
    suggested: view.tasks.filter((t) => !t.confirmed && t.status !== "completed"),
    pending: view.tasks.filter((t) => t.confirmed && t.status === "pending" && !t.overdue),
    in_progress: view.tasks.filter((t) => t.confirmed && t.status === "in_progress" && !t.overdue),
    overdue: view.tasks.filter((t) => t.confirmed && t.overdue),
    completed: view.tasks.filter((t) => t.status === "completed"),
  };
  const rows = groups[tab];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="mt-1 text-sm text-muted">Work found in your email becomes a suggestion. It joins your list only when you add it.</p>
        </div>
      </div>

      <form
        className="card flex flex-wrap items-center gap-2 p-3"
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
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task" aria-label="New task title" className="min-w-[12rem] flex-1 bg-transparent text-sm outline-none" />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className="rounded-md border border-line bg-surface px-2 py-1 text-xs" />
        <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} aria-label="Due time" className="rounded-md border border-line bg-surface px-2 py-1 text-xs" />
        <Button size="sm" variant="primary" disabled={!title.trim()}>
          Add
        </Button>
      </form>

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

      <section className="card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<Check />} title="Nothing here">
            {tab === "suggested" ? "No new tasks found in your email." : "No tasks in this list."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((t) => (
              <li key={t.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                <button
                  onClick={() => apply((s) => updateTask(s, t.id, { status: t.status === "completed" ? "pending" : "completed", confirmed: true }, prefs.name, now()), t.status === "completed" ? "Task reopened" : "Task completed")}
                  aria-label={t.status === "completed" ? "Reopen task" : "Complete task"}
                  className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border", t.status === "completed" ? "border-emerald-500 bg-emerald-500 text-white" : "border-line hover:border-brand")}
                >
                  {t.status === "completed" && <Check className="h-3 w-3" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={cn("text-sm font-medium", t.status === "completed" && "text-muted line-through")}>{t.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span className={cn(t.overdue && "font-medium text-rose-600")}>{t.due ? `Due ${formatDate(t.due.date)}${t.due.time ? ` at ${t.due.time}` : ""} (UTC${offsetLabel(t.due.tz_offset)})` : (t.due_note ?? "No due date")}</span>
                    {t.owner !== null && <span>Owner: {t.owner}</span>}
                    {t.owner === null && t.origin === "extracted" && <span className="text-amber-700 dark:text-amber-300">No confirmed owner</span>}
                    {t.suggested_follow_up && t.status !== "completed" && <span>Follow up {formatDate(t.suggested_follow_up)}</span>}
                    {t.source.message_id && (
                      <button onClick={() => navigate(`/inbox?t=${encodeURIComponent(t.source.thread_key)}`)} className="inline-flex items-center gap-1 text-brand hover:underline">
                        <Mail className="h-3 w-3" /> source email
                      </button>
                    )}
                  </div>
                  {t.due?.needs_confirmation.map((n) => (
                    <div key={n} className="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="h-3 w-3" /> Please confirm: {n}
                    </div>
                  ))}
                  {t.source.quote && <p className="mt-1 line-clamp-1 text-xs italic text-muted">"{t.source.quote}"</p>}
                </div>
                <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                {t.confirmed ? (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={t.status}
                      onChange={(e) => apply((s) => updateTask(s, t.id, { status: e.target.value as MailTaskStatus }, prefs.name, now()))}
                      aria-label="Status"
                      className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs"
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In progress</option>
                      <option value="completed">Completed</option>
                    </select>
                    {t.due && t.status !== "completed" && (
                      <Button
                        size="xs"
                        variant="ghost"
                        aria-label="Remind me a day before"
                        onClick={() => {
                          const at = new Date(Date.parse(`${t.due!.date}T${t.due!.time ?? "09:00"}:00${offsetLabel(t.due!.tz_offset)}`) - 86_400_000).toISOString();
                          apply((s) => addReminder(s, { kind: "task", id: t.id }, at, `Due tomorrow: ${t.title}`, prefs.name, now()), "Reminder set for a day before");
                        }}
                      >
                        <Bell className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <Button size="xs" variant="primary" onClick={() => apply((s) => updateTask(s, t.id, { confirmed: true }, prefs.name, now()), "Added to tasks")}>
                      Add
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => apply((s) => updateTask(s, t.id, { dismissed: true }, prefs.name, now()), "Suggestion dismissed")}>
                      Dismiss
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
