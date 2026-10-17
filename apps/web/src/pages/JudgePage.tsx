import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, Gavel, MinusCircle, XCircle } from "lucide-react";
import { computeMetrics, type Decision } from "@c16/core";
import { useTriage } from "../store/triage";
import { LABELS, labelsFor } from "../lib/starter";
import { Meter } from "../components/charts";
import { Badge, Button, EmptyState, PURPOSE_LABEL, cn } from "../ui";

const SHOW_ME: Record<number, { to: string; label: string }> = {
  1: { to: "/inbox/T-dup-ticket", label: "18 → 20 Oct correction" },
  2: { to: "/inbox/T-test-data", label: "E08 draft and lint" },
  3: { to: "/inbox/QUARANTINE", label: "E05 quarantine" },
};

export default function JudgePage() {
  const run = useTriage((s) => s.run);
  const navigate = useNavigate();
  if (!run) {
    return (
      <div className="card">
        <EmptyState icon={<Gavel />} title="No run to judge" action={<Button variant="primary" onClick={() => navigate("/")}>Import the fixture</Button>}>
          The judge view compares the engine with our ground-truth labels.
        </EmptyState>
      </div>
    );
  }
  const r = run.result;
  const m = r.metrics;
  const labels = labelsFor(r.fixture_hash);
  const edits = Object.keys(run.decisionEdits).length;
  const afterReview = labels && edits ? computeMetrics(r, labels) : null;
  const byId = new Map(r.decisions.map((d) => [d.email_id, d]));
  const sameThread = (a: string, b: string) => byId.get(a)?.thread_key === byId.get(b)?.thread_key;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Judge view</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          The engine against <code className="rounded bg-subtle px-1 font-mono text-xs">data/labels/C16_labels.json</code>, the ground truth we wrote for the 12 starter emails before building.
        </p>
      </div>

      {!labels && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
          This run is a changed input (#{r.fixture_hash}). The labels describe the starter fixture only, so Check 1 is not scored. Compare with data/challenges/README.md. Checks 2 and 3 still run.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {m.checks.map((c) => {
          const Icon = c.passed === null ? MinusCircle : c.passed ? CheckCircle2 : XCircle;
          return (
            <section key={c.id} className={cn("card p-5", c.passed === false && "border-rose-500/40")}>
              <div className="flex items-center gap-2">
                <Icon className={cn("h-5 w-5", c.passed === null ? "text-muted" : c.passed ? "text-emerald-600" : "text-rose-600")} />
                <span className="label-xs">Check {c.id}</span>
                <Badge tone={c.passed === null ? "neutral" : c.passed ? "green" : "red"} className="ml-auto">
                  {c.passed === null ? "n/a" : c.passed ? "pass" : "fail"}
                </Badge>
              </div>
              <h2 className="mt-3 font-semibold leading-snug">{c.title}</h2>
              <p className="mt-2 text-sm text-muted">{c.evidence}</p>
              {r.threads.some((t) => SHOW_ME[c.id].to.endsWith(t.thread_key)) && (
                <Button variant="ghost" size="sm" className="-ml-2 mt-3 text-brand" onClick={() => navigate(SHOW_ME[c.id].to)}>
                  Show me: {SHOW_ME[c.id].label} <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </section>
          );
        })}
      </div>

      {m.labels_applied && (
        <>
          <section className="card grid gap-6 p-5 md:grid-cols-[14rem_1fr]">
            <div>
              <div className="label-xs">Seeded critical items</div>
              <div className="mt-1 text-5xl font-semibold tracking-tight">
                {m.seeded_recovered}
                <span className="text-2xl text-muted">/{m.seeded_total}</span>
              </div>
              <p className="mt-1 text-sm text-muted">recovered with their evidence</p>
              {afterReview && <p className="mt-2 text-xs text-violet-600">After {edits} reviewer edit(s): {afterReview.seeded_recovered}/{afterReview.seeded_total}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Meter label="Action-flag precision" value={m.precision_action_flags} max={1} display={`${Math.round(m.precision_action_flags * 100)}%`} />
              <Meter label="Action-flag recall" value={m.recall_action_flags} max={1} display={`${Math.round(m.recall_action_flags * 100)}%`} />
              <Meter label="Remaining decisions (non-seeded, all fields)" value={m.remaining_accuracy} max={1} display={`${Math.round(m.remaining_accuracy * 100)}%`} />
              <Meter label="Thread grouping (pairwise agreement)" value={m.thread_pair_agreement} max={1} display={`${Math.round(m.thread_pair_agreement * 100)}%`} />
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-sm font-semibold">Seeded critical items (Check 1)</h2>
            </div>
            <ul className="divide-y divide-line">
              {m.seeded.map((s) => (
                <li key={s.email_id} className="grid gap-2 px-5 py-3 text-sm sm:grid-cols-[5rem_1fr_1.2fr] sm:items-center">
                  <button onClick={() => navigate(`/inbox/${encodeURIComponent(byId.get(s.email_id)?.thread_key ?? "")}#${s.email_id}`)} className="flex items-center gap-2 font-mono font-semibold hover:text-brand">
                    {s.recovered ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-600" />}
                    {s.email_id}
                  </button>
                  <span>{s.expected}</span>
                  <span className="text-xs text-muted">{s.detail}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-sm font-semibold">Labels vs predictions, all 12 emails</h2>
              <p className="text-xs text-muted">Red cells differ from the label. Threads are compared by grouping, not by name.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <thead className="bg-subtle text-left text-[11px] uppercase tracking-wider text-muted">
                  <tr>
                    {["Email", "Thread (predicted / label)", "Type", "Urgency", "Action", "Status"].map((h) => (
                      <th key={h} className="px-4 py-2 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {LABELS.labels.map((l) => {
                    const d = byId.get(l.email_id) as Decision | undefined;
                    if (!d) return null;
                    const e = run.decisionEdits[l.email_id] ?? {};
                    const groupOk = LABELS.labels.every((o) => (o.thread_key === l.thread_key) === sameThread(o.email_id, l.email_id));
                    const cell = (label: unknown, pred: unknown, edited: boolean, show = String(pred)) => (
                      <td className={cn("px-4 py-2", label !== pred && "bg-rose-500/10 text-rose-700 dark:text-rose-300")}>
                        {show}
                        {label !== pred && <div className="text-[11px]">label: {String(label)}</div>}
                        {edited && <div className="text-[11px] text-violet-600">edited</div>}
                      </td>
                    );
                    return (
                      <tr key={l.email_id}>
                        <td className="px-4 py-2 font-mono font-semibold">{l.email_id}</td>
                        <td className={cn("px-4 py-2 font-mono text-xs", !groupOk && "bg-rose-500/10")}>
                          {d.thread_key} <span className="text-muted">/ {l.thread_key}</span>
                        </td>
                        {cell(l.purpose, d.purpose, "purpose" in e, PURPOSE_LABEL[d.purpose])}
                        {cell(l.urgency, d.urgency, "urgency" in e)}
                        {cell(l.action_needed, d.action_needed, "action_needed" in e)}
                        {cell(l.status, d.status, "status" in e)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
