import { formatDate, type Decision, type Fact, type ThreadFacts } from "@c16/core";
import { Chip, StatusChip } from "./Chips";
import { Icon } from "./Icons";

function Cite({ id, quote, onShow }: { id: string; quote: string; onShow: (e: Fact["evidence"]) => void }) {
  return (
    <button onClick={() => onShow({ email_id: id, quote })} title={`"${quote}"`} className="ml-1 rounded bg-indigo-50 px-1 font-mono text-[11px] text-indigo-700 hover:bg-indigo-100">
      {id}
    </button>
  );
}

/** "What's going on": the thread's current facts at a glance, each linked to its source sentence. */
export function SummaryCard({ t, ds, onShow, aiEnabled }: { t: ThreadFacts; ds: Decision[]; onShow: (e: Fact["evidence"]) => void; aiEnabled: boolean }) {
  const facts = ds.flatMap((d) => d.facts);
  const find = (k: Fact["kind"]) => facts.find((f) => f.kind === k);
  const withAi = ds.filter((d) => d.ai);
  const agree = withAi.filter((d) => d.ai!.decided_by === "both").length;
  const doubts = ds.filter((d) => d.review?.needed);
  const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <div className="flex gap-3 py-1.5 text-sm">
      <dt className="w-20 shrink-0 text-slate-500">{k}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-indigo-50/40 p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <Icon name="sparkle" className="h-4 w-4 text-indigo-500" />
        <h3 className="text-sm font-semibold">What's going on</h3>
        <StatusChip status={t.status} />
      </div>
      <dl className="divide-y divide-slate-100">
        {t.task && (
          <Row k="Task">
            {t.task}
            {find("task") && <Cite id={find("task")!.evidence.email_id} quote={find("task")!.evidence.quote} onShow={onShow} />}
          </Row>
        )}
        {(t.owner !== undefined || t.escalation) && t.thread_key !== "QUARANTINE" && (
          <Row k="Owner">
            {t.owner ?? <Chip tone="amber">no confirmed owner</Chip>}
            {(find("owner") ?? find("escalation")) && <Cite id={(find("owner") ?? find("escalation"))!.evidence.email_id} quote={(find("owner") ?? find("escalation"))!.evidence.quote} onShow={onShow} />}
          </Row>
        )}
        {t.due_history.length > 0 && (
          <Row k="Deadline">
            {t.due_history.map((h) => (
              <span key={h.email_id + h.date} className="mr-2 inline-flex items-center">
                <span className={h.superseded_by ? "text-slate-400 line-through" : "font-semibold text-slate-900"}>{formatDate(h.date)}</span>
                <Cite id={h.email_id} quote={h.quote} onShow={onShow} />
              </span>
            ))}
            {t.due_history.some((h) => h.superseded_by) && <span className="block text-xs text-emerald-700">corrected; the latest date wins</span>}
          </Row>
        )}
        {t.watch_date && <Row k="Watch">sender acts on {formatDate(t.watch_date)} (not our task)</Row>}
        {t.references.length > 0 && (
          <Row k="Tracked">
            {t.references.join(", ")}: no new ticket
            {find("reference") && <Cite id={find("reference")!.evidence.email_id} quote={find("reference")!.evidence.quote} onShow={onShow} />}
          </Row>
        )}
        {t.constraints.map((c) => (
          <Row key={c} k="Constraint">
            {c}
          </Row>
        ))}
        {t.clarify.length > 0 && <Row k="Clarify">{t.clarify.join(", ")}</Row>}
        {t.attachment_claimed && (
          <Row k="File">
            <Chip tone="amber">claimed, unverified</Chip>
            {find("attachment_claim") && <Cite id={find("attachment_claim")!.evidence.email_id} quote={find("attachment_claim")!.evidence.quote} onShow={onShow} />}
          </Row>
        )}
        {t.duplicate_count > 0 && <Row k="Repeats">{t.duplicate_count} merged, counted once</Row>}
      </dl>

      {t.escalations.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {t.escalations.map((e) => (
            <Chip key={e.code} tone={e.severity === "high" ? "red" : "amber"} title={e.reason}>
              <Icon name="alert" className="h-3 w-3" /> {e.reason}
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
        <Icon name="flask" className="h-3.5 w-3.5" />
        {withAi.length ? (
          <span>
            Type check: AI agrees with the rules on {agree}/{withAi.length} email(s)
            {doubts.length ? `; ${doubts.length} flagged for review` : ""}
          </span>
        ) : (
          <span>{aiEnabled ? "AI did not run for this import" : "Type check: rules only (AI not enabled)"}{doubts.length ? `; ${doubts.length} flagged for review` : ""}</span>
        )}
        {t.inferred_links.length > 0 && <Chip tone="amber">inferred link: {t.inferred_links.map((l) => l.email_id).join(", ")}</Chip>}
      </div>
    </section>
  );
}
