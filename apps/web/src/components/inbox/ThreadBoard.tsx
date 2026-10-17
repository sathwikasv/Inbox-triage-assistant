import { AlertTriangle, Archive, Eye, ListChecks, MailCheck, Reply, type LucideIcon } from "lucide-react";
import type { NextActionKind, ThreadFacts, TriageResult } from "@c16/core";
import { decisionsOf, sortThreads, topUrgency } from "../../lib/views";
import { formatDay, formatReceived } from "../../lib/format";
import type { SavedRun } from "../../repo";
import { ACTION_META, AgeBadge, Badge, PurposeBadge, UrgencyBadge, cn } from "../../ui";

const COLUMNS: { kind: NextActionKind; title: string; hint: string; icon: LucideIcon }[] = [
  { kind: "escalate", title: "Escalate", hint: "needs someone with authority", icon: AlertTriangle },
  { kind: "review", title: "Check the type", hint: "uncertain classification", icon: ListChecks },
  { kind: "reply", title: "Reply", hint: "a draft is ready to review", icon: Reply },
  { kind: "watch", title: "Waiting on sender", hint: "nothing asked of us yet", icon: Eye },
  { kind: "archive", title: "Done", hint: "resolved or informational", icon: Archive },
];

/** Segregation at a glance: every thread in the column of the action it needs next. */
export function ThreadBoard({ run, threads, onOpen }: { run: SavedRun; threads: ThreadFacts[]; onOpen: (key: string) => void }) {
  const r: TriageResult = run.result;
  return (
    <div className="flex h-full min-h-0 gap-3 overflow-x-auto bg-canvas p-3">
      {COLUMNS.map((c) => {
        const items = sortThreads(r, threads.filter((t) => t.next_action.kind === c.kind));
        const meta = ACTION_META[c.kind];
        return (
          <section key={c.kind} className="flex w-72 min-w-[16rem] shrink-0 flex-col rounded-xl border border-line bg-subtle/70" aria-label={c.title}>
            <header className="flex items-center gap-2 px-3 pb-2 pt-3">
              <span className={cn("h-2 w-2 rounded-full", meta.stripe)} />
              <c.icon className="h-4 w-4 text-muted" />
              <h3 className="text-sm font-semibold">{c.title}</h3>
              <span className="ml-auto rounded-md bg-surface px-1.5 text-xs tabular-nums text-muted ring-1 ring-line">{items.length}</span>
            </header>
            <p className="px-3 pb-2 text-[11px] text-muted">{c.hint}</p>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {items.map((t) => {
                const ds = decisionsOf(r, t);
                const latest = ds.at(-1)!;
                const purposes = [...new Set(ds.map((d) => d.purpose))];
                const reply = run.replies?.[t.thread_key];
                return (
                  <button key={t.thread_key} onClick={() => onOpen(t.thread_key)} className="group relative w-full overflow-hidden rounded-lg border border-line bg-surface p-3 text-left shadow-card transition hover:-translate-y-px hover:border-brand/40 hover:shadow-pop">
                    <span className={cn("absolute inset-y-0 left-0 w-[3px]", meta.stripe)} />
                    <div className="flex items-start gap-2">
                      <span className="line-clamp-2 flex-1 text-sm font-semibold leading-snug">{t.title}</span>
                      <span className="shrink-0 text-[10px] text-muted">{formatReceived(t.last_activity)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">
                      <span className="font-mono">{latest.email_id}</span> · {t.thread_key === "QUARANTINE" ? "content quarantined" : latest.body}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {purposes.slice(0, 2).map((p) => (
                        <PurposeBadge key={p} purpose={p} />
                      ))}
                      <UrgencyBadge urgency={topUrgency(ds)} />
                      <AgeBadge days={t.age_days} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted">
                      {t.owner ? <Badge>{t.owner}</Badge> : t.owner === null ? <Badge tone="amber">no owner</Badge> : null}
                      {t.latest_due && <Badge>due {formatDay(t.latest_due).replace(/ \d{4}$/, "")}</Badge>}
                      {reply?.replied_at ? (
                        <Badge tone="green">
                          <MailCheck className="h-3 w-3" /> replied
                        </Badge>
                      ) : reply ? (
                        <Badge tone="blue">handed off</Badge>
                      ) : null}
                      {t.escalations.slice(0, 1).map((e) => (
                        <span key={e.code} className="truncate text-rose-600">
                          {e.reason}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
              {items.length === 0 && <div className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-muted">Nothing here</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
