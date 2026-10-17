import { useNavigate } from "react-router-dom";
import * as DM from "@radix-ui/react-dropdown-menu";
import { AlarmClock, Bell, CalendarX2, CheckCheck, FilePen, HelpCircle, ShieldAlert, Sparkles, Tag, type LucideIcon } from "lucide-react";
import { useAssistant } from "../store/assistant";
import { useReviewItems, type ReviewKind } from "../lib/review";
import { cn } from "../ui";

const KIND: Record<ReviewKind, { icon: LucideIcon; cls: string }> = {
  quarantine: { icon: ShieldAlert, cls: "bg-rose-600 text-white" },
  assistant: { icon: Sparkles, cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  approval: { icon: FilePen, cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  date: { icon: HelpCircle, cls: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
  clash: { icon: CalendarX2, cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
  overdue: { icon: AlarmClock, cls: "bg-red-600 text-white" },
  category: { icon: Tag, cls: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300" },
};

/** Everything that needs a person, in one place. Opening an item marks it as seen. */
export function NotificationBell() {
  const items = useReviewItems();
  const { seen, markSeen } = useAssistant();
  const navigate = useNavigate();
  const unseen = items.filter((i) => !seen.includes(i.id));
  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button className="relative grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-fg/[0.08] hover:text-fg" aria-label={`Needs your review: ${unseen.length} new`}>
          <Bell className="h-5 w-5" />
          {unseen.length > 0 && <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{unseen.length > 9 ? "9+" : unseen.length}</span>}
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={8} className="z-50 w-[min(26rem,calc(100vw-1rem))] animate-fade-in overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Needs your review</div>
              <div className="text-xs text-muted">Flagged by the rules and the AI assistant. Nothing here was sent or changed.</div>
            </div>
            {unseen.length > 0 && (
              <button onClick={() => markSeen(items.map((i) => i.id))} className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-brand hover:bg-brand-soft">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-1">
            {items.length === 0 && <div className="px-4 py-10 text-center text-sm text-muted">Nothing needs your review right now.</div>}
            {items.map((i) => {
              const K = KIND[i.kind];
              const isNew = !seen.includes(i.id);
              return (
                <DM.Item
                  key={i.id}
                  onSelect={() => {
                    markSeen([i.id]);
                    navigate(`/inbox?t=${encodeURIComponent(i.thread_key)}`);
                  }}
                  className="flex cursor-pointer gap-3 rounded-xl px-3 py-2.5 outline-none data-[highlighted]:bg-subtle"
                >
                  <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", K.cls)}>
                    <K.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", isNew ? "font-semibold" : "text-fg/80")}>{i.title}</span>
                    <span className="line-clamp-2 text-xs text-muted">{i.detail}</span>
                    <span className="mt-1 flex items-center gap-1.5">
                      <span className={cn("rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide", i.source === "ai" ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" : "bg-subtle text-muted")}>{i.source === "ai" ? "AI" : "Rules"}</span>
                      {i.severity === "high" && <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-600">high</span>}
                    </span>
                  </span>
                  {isNew && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="new" />}
                </DM.Item>
              );
            })}
          </div>
          {items.length > 0 && (
            <DM.Item onSelect={() => navigate("/inbox?view=review")} className="block cursor-pointer border-t border-line px-4 py-2.5 text-center text-xs font-medium text-brand outline-none data-[highlighted]:bg-subtle">
              Open the Needs review folder
            </DM.Item>
          )}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
