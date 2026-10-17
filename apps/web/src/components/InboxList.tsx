import type { ThreadFacts, TriageResult } from "@c16/core";
import { Icon } from "./Icons";
import { ACTION_STYLE, ageBucket, decisionsOf, topUrgency } from "../lib/views";
import { formatDay, formatReceived } from "../lib/format";

const URG_DOT = { high: "bg-rose-500", medium: "bg-amber-400", low: "bg-slate-300", "n/a": "bg-slate-200" } as const;

export function InboxList({ r, threads, selected, onSelect }: { r: TriageResult; threads: ThreadFacts[]; selected?: string; onSelect: (key: string) => void }) {
  if (!threads.length) return <div className="p-8 text-center text-sm text-slate-500">Nothing in this view.</div>;
  return (
    <ul role="listbox" aria-label="Threads" className="divide-y divide-slate-100">
      {threads.map((t) => {
        const ds = decisionsOf(r, t);
        const latest = ds.at(-1)!;
        const urgency = topUrgency(ds);
        const style = ACTION_STYLE[t.next_action.kind];
        const age = ageBucket(t.age_days);
        const active = t.thread_key === selected;
        const review = ds.some((d) => d.review?.needed);
        return (
          <li key={t.thread_key} role="option" aria-selected={active}>
            <button
              onClick={() => onSelect(t.thread_key)}
              className={`relative flex w-full gap-3 py-3 pl-4 pr-3 text-left transition ${active ? "bg-indigo-50/70" : "hover:bg-slate-50"}`}
            >
              <span className={`absolute inset-y-2 left-0 w-1 rounded-r ${style.bar}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${URG_DOT[urgency]}`} title={`${urgency} urgency`} />
                  <span className={`truncate text-sm ${t.action_needed ? "font-semibold text-slate-900" : "text-slate-700"}`}>{t.title}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-slate-500">{formatReceived(t.last_activity)}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  <span className="font-mono">{latest.email_id}</span> · {t.thread_key === "QUARANTINE" ? "content quarantined" : latest.body}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${style.pill}`}>
                    <Icon name={style.icon} className="h-3 w-3" /> {t.next_action.label}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${age.tone}`}>{age.label}</span>
                  {t.latest_due && <span className="text-[11px] text-slate-600">due {formatDay(t.latest_due)}</span>}
                  {t.owner && <span className="text-[11px] text-slate-600">· {t.owner}</span>}
                  {review && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">review</span>}
                  {t.email_ids.length > 1 && <span className="text-[11px] text-slate-400">{t.email_ids.length} emails</span>}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
