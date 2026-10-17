import type { Decision, Fact, ThreadFacts } from "@c16/core";
import { Chip } from "./Chips";
import { formatDay } from "../lib/format";

function Evidence({ f, onShow }: { f: Fact["evidence"]; onShow: (e: Fact["evidence"]) => void }) {
  return (
    <button onClick={() => onShow(f)} className="ml-1 text-xs text-indigo-700 underline decoration-dotted hover:text-indigo-900" title={`"${f.quote}"`}>
      {f.email_id}
    </button>
  );
}

export function ThreadFactsPanel({ t, decisions, onShow }: { t: ThreadFacts; decisions: Decision[]; onShow: (e: Fact["evidence"]) => void }) {
  const facts = decisions.flatMap((d) => d.facts);
  const find = (kind: Fact["kind"], value?: string) => facts.find((f) => f.kind === kind && (value === undefined || f.value === value));
  const task = find("task");
  const owner = t.owner ? find("owner", t.owner) : find("escalation");
  const row = "grid grid-cols-[6.5rem_1fr] gap-2 py-1.5 border-b border-slate-100 last:border-0";
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Thread facts</h2>
      <p className="mb-2 text-xs text-slate-500">Every fact links to the sentence it came from.</p>
      <div className="text-sm">
        {t.task && (
          <div className={row}>
            <span className="text-slate-500">Task</span>
            <span>
              {t.task}
              {task && <Evidence f={task.evidence} onShow={onShow} />}
            </span>
          </div>
        )}
        {(t.owner !== undefined || t.escalation) && (
          <div className={row}>
            <span className="text-slate-500">Owner</span>
            <span>
              {t.owner ? t.owner : <Chip tone="amber">no confirmed owner: escalate</Chip>}
              {owner && <Evidence f={owner.evidence} onShow={onShow} />}
            </span>
          </div>
        )}
        {t.due_history.length > 0 && (
          <div className={row}>
            <span className="text-slate-500">Deadline</span>
            <span className="space-y-0.5">
              {t.due_history.map((h) => (
                <span key={h.email_id + h.date} className="block">
                  <span className={h.superseded_by ? "text-slate-400 line-through" : "font-semibold"}>{formatDay(h.date)}</span>
                  <Evidence f={{ email_id: h.email_id, quote: h.quote }} onShow={onShow} />
                  {h.superseded_by && <span className="ml-1 text-xs text-slate-500">superseded by {h.superseded_by}</span>}
                  {h.from_correction && !h.superseded_by && <span className="ml-1 text-xs text-emerald-700">current (correction)</span>}
                </span>
              ))}
            </span>
          </div>
        )}
        {t.watch_date && (
          <div className={row}>
            <span className="text-slate-500">Watch</span>
            <span>
              sender's own commitment, {formatDay(t.watch_date)} (not our action)
              {find("commitment") && <Evidence f={find("commitment")!.evidence} onShow={onShow} />}
            </span>
          </div>
        )}
        {t.references.length > 0 && (
          <div className={row}>
            <span className="text-slate-500">Tracked as</span>
            <span>
              {t.references.join(", ")}: no new ticket
              {find("reference") && <Evidence f={find("reference")!.evidence} onShow={onShow} />}
            </span>
          </div>
        )}
        {t.constraints.map((c) => (
          <div key={c} className={row}>
            <span className="text-slate-500">Constraint</span>
            <span>
              {c}
              {find("constraint", c) && <Evidence f={find("constraint", c)!.evidence} onShow={onShow} />}
            </span>
          </div>
        ))}
        {t.clarify.length > 0 && (
          <div className={row}>
            <span className="text-slate-500">To clarify</span>
            <span>
              {t.clarify.join(", ")}
              {find("clarify") && <Evidence f={find("clarify")!.evidence} onShow={onShow} />}
            </span>
          </div>
        )}
        {t.attachment_claimed && (
          <div className={row}>
            <span className="text-slate-500">Attachment</span>
            <span>
              <Chip tone="amber">claimed, unverified</Chip>
              {find("attachment_claim") && <Evidence f={find("attachment_claim")!.evidence} onShow={onShow} />}
              <span className="mt-1 block text-xs text-slate-500">The import has no attachment data, so drafts may not say the file was received.</span>
            </span>
          </div>
        )}
        {t.suppress_chaser && (
          <div className={row}>
            <span className="text-slate-500">Chaser</span>
            <span>suppressed: the item is resolved</span>
          </div>
        )}
        {t.duplicate_count > 0 && (
          <div className={row}>
            <span className="text-slate-500">Duplicates</span>
            <span>{t.duplicate_count} repeat(s) merged; counted once</span>
          </div>
        )}
      </div>
      {t.inferred_links.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <div className="font-semibold">Inferred link: please confirm</div>
          {t.inferred_links.map((l) => (
            <div key={l.email_id}>
              {l.email_id}: {l.rule}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
