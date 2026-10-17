import { Archive, BadgeCheck, Eye, FileDown, Pencil, Save, ShieldAlert, Tag, TrendingUp, type LucideIcon } from "lucide-react";
import type { ThreadFacts } from "@c16/core";
import type { AuditEvent } from "../../repo";
import { formatStamp } from "../../lib/format";
import { cn } from "../../ui";

const ICON: Record<string, { icon: LucideIcon; cls: string }> = {
  import: { icon: FileDown, cls: "bg-slate-500" },
  reimport: { icon: FileDown, cls: "bg-slate-500" },
  quarantine: { icon: ShieldAlert, cls: "bg-rose-600" },
  edit_draft: { icon: Pencil, cls: "bg-violet-500" },
  edit_decision: { icon: Pencil, cls: "bg-violet-500" },
  preview_label: { icon: Tag, cls: "bg-sky-500" },
  preview_archive: { icon: Archive, cls: "bg-sky-500" },
  escalate: { icon: TrendingUp, cls: "bg-rose-500" },
  watch: { icon: Eye, cls: "bg-cyan-500" },
  archive: { icon: Archive, cls: "bg-slate-500" },
  approve_draft: { icon: BadgeCheck, cls: "bg-emerald-600" },
  save: { icon: Save, cls: "bg-emerald-600" },
};

export function threadEvents(audit: AuditEvent[], t?: ThreadFacts) {
  return audit.filter((e) => !t || e.thread_key === t.thread_key || (e.email_id && t.email_ids.includes(e.email_id))).reverse();
}

export function ActivityList({ events, empty = "No activity yet." }: { events: AuditEvent[]; empty?: string }) {
  if (!events.length) return <p className="px-1 py-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-line">
      {events.map((e, i) => {
        const m = ICON[e.type] ?? ICON.import;
        return (
          <li key={i} className="relative flex gap-3">
            <span className={cn("z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white ring-4 ring-surface", m.cls)}>
              <m.icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 pt-0.5 text-sm">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="font-medium capitalize">{e.type.replace(/_/g, " ")}</span>
                {(e.email_id || e.thread_key) && <span className="font-mono text-xs text-muted">{e.email_id ?? e.thread_key}</span>}
                <span className="text-xs text-muted">{formatStamp(e.at)}</span>
              </div>
              <p className="text-muted">{e.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
