import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import type { Fact } from "@c16/core";
import { useTriage } from "../store/triage";
import { Chip, StatusChip } from "../components/Chips";
import { Empty, QuarantineBanner } from "../components/Banners";
import { EmailCard } from "../components/EmailCard";
import { ThreadFactsPanel } from "../components/ThreadFactsPanel";
import { DraftEditor } from "../components/DraftEditor";

export default function ThreadPage() {
  const { key = "" } = useParams();
  const { hash } = useLocation();
  const run = useTriage((s) => s.run);
  const actionError = useTriage((s) => s.actionError);
  const [active, setActive] = useState<Fact["evidence"] | null>(null);

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash]);

  if (!run) return <Empty>No inbox imported yet. <Link className="text-indigo-700 underline" to="/">Import the fixture</Link>.</Empty>;
  const t = run.result.threads.find((x) => x.thread_key === key);
  if (!t) return <Empty>Thread {key} is not in this run. <Link className="text-indigo-700 underline" to="/triage">Back to triage</Link></Empty>;
  const ds = run.result.decisions.filter((d) => d.thread_key === key).sort((a, b) => t.email_ids.indexOf(a.email_id) - t.email_ids.indexOf(b.email_id));
  const draft = run.result.drafts.find((d) => d.thread_key === key);

  const show = (e: Fact["evidence"]) => {
    setActive(e);
    document.getElementById(e.email_id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="space-y-4">
      <Link to="/triage" className="text-sm text-indigo-700 hover:underline">
        ← All threads
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <span className="font-mono text-sm text-slate-500">{t.thread_key}</span>
        <StatusChip status={t.status} />
        {t.action_needed ? <Chip tone="blue">action now</Chip> : <Chip>no action now</Chip>}
      </div>
      {t.thread_key === "QUARANTINE" && <QuarantineBanner quarantined={ds} policy={run.result.policy} />}
      {actionError && (
        <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {actionError}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Emails in time order</h2>
          {ds.map((d) => (
            <EmailCard key={d.email_id} d={d} edited={!!run.decisionEdits[d.email_id]} activeQuote={active?.email_id === d.email_id ? active.quote : null} />
          ))}
        </section>
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <ThreadFactsPanel t={t} decisions={ds} onShow={show} />
          <DraftEditor t={t} draft={draft} edit={run.edits[key]} />
        </aside>
      </div>
    </div>
  );
}
