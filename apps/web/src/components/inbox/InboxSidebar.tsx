import { AlertTriangle, CheckCircle2, Eye, Inbox, ListChecks, Reply, ShieldAlert, Tag, type LucideIcon } from "lucide-react";
import type { TriageResult } from "@c16/core";
import { VIEWS, decisionsOf } from "../../lib/views";
import { cn } from "../../ui";
import type { SavedRun } from "../../repo";

const VIEW_ICON: Record<string, LucideIcon> = { all: Inbox, action: Reply, escalations: AlertTriangle, review: ListChecks, watch: Eye, resolved: CheckCircle2, quarantine: ShieldAlert };
const LABEL_DOT: Record<string, string> = {
  Urgent: "bg-rose-500",
  "Needs owner": "bg-amber-500",
  Blocked: "bg-orange-500",
  Action: "bg-indigo-500",
  Resolved: "bg-emerald-500",
  Duplicate: "bg-slate-400",
  FYI: "bg-sky-400",
  "Waiting on sender": "bg-cyan-500",
  "In progress": "bg-violet-500",
  Quarantine: "bg-red-600",
  "Security review": "bg-red-400",
};

/** Proposed labels per thread (union over its emails); preview only, nothing is applied to a mailbox. */
export function threadLabels(r: TriageResult, key: string): string[] {
  const t = r.threads.find((x) => x.thread_key === key)!;
  return [...new Set(decisionsOf(r, t).flatMap((d) => d.proposed.labels.filter((l) => !l.startsWith("Tracked:") && !l.startsWith("Follow up"))))];
}

export function InboxSidebar({ run, view, onView, label, onLabel }: { run: SavedRun; view: string; onView: (v: string) => void; label: string | null; onLabel: (l: string | null) => void }) {
  const r = run.result;
  const labels = [...new Set(r.threads.flatMap((t) => threadLabels(r, t.thread_key)))].sort();
  return (
    <aside className="flex h-full flex-col gap-5 overflow-y-auto border-r border-line bg-surface p-3">
      <div>
        <div className="label-xs px-2 pb-1.5">Inbox</div>
        {VIEWS.map((v) => {
          const Icon = VIEW_ICON[v.id] ?? Inbox;
          const n = r.threads.filter((t) => v.test(t, decisionsOf(r, t))).length;
          const on = view === v.id && !label;
          return (
            <button
              key={v.id}
              onClick={() => {
                onView(v.id);
                onLabel(null);
              }}
              className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors", on ? "bg-brand-soft font-semibold text-brand" : "text-fg/80 hover:bg-subtle")}
            >
              <Icon className={cn("h-4 w-4", on ? "text-brand" : "text-muted")} />
              <span className="flex-1 text-left">{v.label}</span>
              {n > 0 && <span className={cn("min-w-[1.5rem] rounded-md px-1.5 text-center text-xs tabular-nums", on ? "bg-brand/15" : v.id === "escalations" ? "bg-rose-500/10 text-rose-600" : "text-muted")}>{n}</span>}
            </button>
          );
        })}
      </div>

      <div>
        <div className="label-xs flex items-center gap-1.5 px-2 pb-1.5">
          <Tag className="h-3 w-3" /> Suggested labels
        </div>
        {labels.map((l) => {
          const n = r.threads.filter((t) => threadLabels(r, t.thread_key).includes(l)).length;
          const on = label === l;
          return (
            <button key={l} onClick={() => onLabel(on ? null : l)} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-sm", on ? "bg-subtle font-medium" : "text-fg/75 hover:bg-subtle")}>
              <span className={cn("h-2 w-2 rounded-full", LABEL_DOT[l] ?? "bg-slate-400")} />
              <span className="flex-1 text-left">{l}</span>
              <span className="text-xs tabular-nums text-muted">{n}</span>
            </button>
          );
        })}
        <p className="px-2 pt-1.5 text-[11px] leading-snug text-muted">Labels are suggestions. Applying them to a mailbox is preview-only.</p>
      </div>

      <div className="mt-auto rounded-xl border border-line bg-subtle p-3 text-xs">
        <div className="label-xs mb-1">Data source</div>
        <div className="truncate font-medium" title={run.source}>
          {run.source}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-2 text-muted">
          <span>{r.decisions.length} emails</span>
          <span>{r.threads.length} threads</span>
          <span className="font-mono">#{r.fixture_hash}</span>
        </div>
        <div className="mt-1 text-muted">
          {run.storage === "api" ? "Saved to API · MongoDB" : "Saved in this browser"}
          {run.ai?.status === "ok" ? ` · AI ${run.ai.model}` : ""}
        </div>
      </div>
    </aside>
  );
}
