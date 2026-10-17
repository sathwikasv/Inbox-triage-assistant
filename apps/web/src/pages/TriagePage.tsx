import { Link } from "react-router-dom";
import type { ThreadFacts, Urgency } from "@c16/core";
import { useTriage } from "../store/triage";
import { Chip, PurposeChip, StatusChip, UrgencyChip } from "../components/Chips";
import { Empty, QuarantineBanner } from "../components/Banners";
import { formatDay, formatReceived } from "../lib/format";

const RANK: Record<Urgency, number> = { high: 0, medium: 1, low: 2, "n/a": 3 };

export default function TriagePage() {
  const run = useTriage((s) => s.run);
  if (!run) return <Empty>No inbox imported yet. <Link className="text-indigo-700 underline" to="/">Import the fixture</Link> to start.</Empty>;
  const { result } = run;
  const decisions = (t: ThreadFacts) => result.decisions.filter((d) => d.thread_key === t.thread_key);
  const top = (t: ThreadFacts) => Math.min(...decisions(t).map((d) => RANK[d.urgency]));
  const threads = [...result.threads].sort((a, b) => Number(b.action_needed) - Number(a.action_needed) || top(a) - top(b));
  const quarantined = result.decisions.filter((d) => d.status === "quarantined");

  const stat = (label: string, n: number, tone: string) => (
    <div className={`rounded-lg border bg-white p-3 shadow-sm ${tone}`}>
      <div className="text-2xl font-semibold tabular-nums">{n}</div>
      <div className="text-xs text-slate-600">{label}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Triage</h1>
          <p className="text-sm text-slate-600">Threads are grouped by what the emails say (tracker ids, topics, "the earlier blocker"), not by subject line.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat("threads need action now", result.threads.filter((t) => t.action_needed).length, "border-sky-200")}
        {stat("need an owner (escalate)", result.threads.filter((t) => t.escalation && t.thread_key !== "QUARANTINE").length, "border-amber-200")}
        {stat("resolved, chaser suppressed", result.threads.filter((t) => t.suppress_chaser).length, "border-emerald-200")}
        {stat("quarantined", quarantined.length, "border-red-200")}
      </div>

      <QuarantineBanner quarantined={quarantined} policy={result.policy} />

      <ul className="space-y-3">
        {threads.map((t) => {
          const ds = decisions(t);
          const edited = run.edits[t.thread_key];
          return (
            <li key={t.thread_key} className={`rounded-lg border bg-white shadow-sm ${t.thread_key === "QUARANTINE" ? "border-red-300" : t.action_needed ? "border-sky-300" : "border-slate-200"}`}>
              <Link to={`/thread/${encodeURIComponent(t.thread_key)}`} className="block p-4 hover:bg-slate-50">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{t.title}</span>
                  <span className="font-mono text-xs text-slate-500">{t.thread_key}</span>
                  <StatusChip status={t.status} />
                  {t.action_needed && <Chip tone="blue">action now</Chip>}
                  {t.escalation && t.thread_key !== "QUARANTINE" && <Chip tone="amber">needs owner</Chip>}
                  {t.inferred_links.length > 0 && <Chip tone="amber">inferred link: confirm</Chip>}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                  {t.owner && <span>Owner {t.owner}</span>}
                  {t.latest_due && <span>Due {formatDay(t.latest_due)}</span>}
                  {t.references.length > 0 && <span>Tracked as {t.references.join(", ")}</span>}
                  <span>
                    Draft: {t.draft_mode === "none" ? `none (${t.draft_reason})` : edited ? "edited" : t.draft_mode === "ack" ? "acknowledgement" : "reply ready"}
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {ds.map((d) => (
                    <li key={d.email_id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-10 font-mono text-xs font-semibold">{d.email_id}</span>
                      <span className="w-24 text-xs text-slate-500">{formatReceived(d.received_at)}</span>
                      <PurposeChip purpose={d.purpose} />
                      <UrgencyChip urgency={d.urgency} />
                      <span className="min-w-0 flex-1 truncate text-slate-700">{d.thread_key === "QUARANTINE" ? "(content quarantined)" : d.body}</span>
                    </li>
                  ))}
                </ul>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
