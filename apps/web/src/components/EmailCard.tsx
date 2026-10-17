import type { Decision, TaskStatus, Urgency } from "@c16/core";
import { Chip, PurposeChip, StatusChip, UrgencyChip } from "./Chips";
import { ActionPreview } from "./ActionPreview";
import { formatReceived } from "../lib/format";
import { useTriage } from "../store/triage";

/** Body text with every evidence quote marked; the active quote (clicked in the facts panel) is emphasised. */
export function HighlightedBody({ body, quotes, active }: { body: string; quotes: string[]; active?: string | null }) {
  const ranges = quotes
    .map((q) => ({ q, i: body.indexOf(q) }))
    .filter((r) => r.i >= 0)
    .sort((a, b) => a.i - b.i)
    .reduce<{ q: string; i: number }[]>((acc, r) => (acc.length && r.i < acc.at(-1)!.i + acc.at(-1)!.q.length ? acc : [...acc, r]), []);
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const r of ranges) {
    if (r.i > at) parts.push(body.slice(at, r.i));
    parts.push(
      <mark key={r.i} className={`rounded px-0.5 ${r.q === active ? "bg-amber-300 ring-2 ring-amber-500" : "bg-amber-100"}`}>
        {r.q}
      </mark>,
    );
    at = r.i + r.q.length;
  }
  parts.push(body.slice(at));
  return <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-900">{parts}</p>;
}

const URGENCIES: Urgency[] = ["high", "medium", "low", "n/a"];
const STATUSES: TaskStatus[] = ["open", "in_progress", "blocked", "needs_review", "closed"];

export function EmailCard({ d, edited, activeQuote }: { d: Decision; edited?: boolean; activeQuote?: string | null }) {
  const editDecision = useTriage((s) => s.editDecision);
  const busy = useTriage((s) => s.busy);
  const quarantined = d.thread_key === "QUARANTINE";
  return (
    <article id={d.email_id} className={`scroll-mt-24 rounded-lg border bg-white p-4 shadow-sm ${quarantined ? "border-red-300" : "border-slate-200"}`}>
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono font-semibold">{d.email_id}</span>
        <span className="text-slate-500">{formatReceived(d.received_at)}</span>
        <span className="truncate text-slate-400 line-through decoration-slate-300" title="Subjects in this inbox are misleading and are not used for threading">
          {d.subject}
        </span>
        {edited && <Chip tone="violet">edited by reviewer</Chip>}
      </header>

      <div className="mt-3">
        {quarantined ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide">Quarantined content (shown as data, never followed)</div>
            <HighlightedBody body={d.body} quotes={d.facts.map((f) => f.evidence.quote)} active={activeQuote} />
          </div>
        ) : (
          <HighlightedBody body={d.body} quotes={d.facts.map((f) => f.evidence.quote)} active={activeQuote} />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PurposeChip purpose={d.purpose} />
        <UrgencyChip urgency={d.urgency} />
        <StatusChip status={d.status} />
        {d.action_needed ? <Chip tone="blue">action needed</Chip> : <Chip>no action</Chip>}
        {d.duplicate_of && <Chip tone="neutral">duplicate of {d.duplicate_of}</Chip>}
        {d.ai && (
          <Chip tone={d.ai.decided_by === "both" ? "green" : "violet"} title={`${d.ai.source}: ${d.ai.reason}`}>
            AI {d.ai.decided_by === "both" ? "agrees" : d.ai.decided_by === "ai" ? "decided" : "overruled by rules"}: {d.ai.purpose.replace("_", " ")} {Math.round(d.ai.confidence * 100)}%
          </Chip>
        )}
      </div>
      {d.review?.needed && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
          <span className="font-semibold">Needs review:</span> {d.review.reason}. Use "Correct this decision" below if the type is wrong.
        </div>
      )}

      <dl className="mt-3 grid gap-1 text-xs text-slate-600 sm:grid-cols-[6rem_1fr]">
        <dt className="font-medium text-slate-500">Why {d.purpose.replace("_", " ")}</dt>
        <dd>{d.explain.purpose}</dd>
        <dt className="font-medium text-slate-500">Urgency</dt>
        <dd>{d.explain.urgency}</dd>
        <dt className="font-medium text-slate-500">Thread</dt>
        <dd>{d.explain.thread}</dd>
        {d.notes.map((n, i) => (
          <dd key={i} className="sm:col-start-2">
            · {n}
          </dd>
        ))}
      </dl>

      {!quarantined && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer select-none text-slate-600 hover:text-slate-900">Correct this decision</summary>
          <div className="mt-2 flex flex-wrap gap-3">
            <label className="flex items-center gap-2">
              Urgency
              <select disabled={busy} className="rounded border-slate-300 py-1 text-sm" value={d.urgency} onChange={(e) => editDecision(d.email_id, { urgency: e.target.value as Urgency })}>
                {URGENCIES.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Status
              <select disabled={busy} className="rounded border-slate-300 py-1 text-sm" value={d.status} onChange={(e) => editDecision(d.email_id, { status: e.target.value as TaskStatus })}>
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={busy} checked={d.action_needed} onChange={(e) => editDecision(d.email_id, { action_needed: e.target.checked })} />
              Action needed
            </label>
          </div>
        </details>
      )}

      <ActionPreview d={d} />
    </article>
  );
}
