import { Link } from "react-router-dom";
import { computeMetrics, type Decision, type LabelRow } from "@c16/core";
import { useTriage } from "../store/triage";
import { Chip } from "../components/Chips";
import { Empty } from "../components/Banners";
import { LABELS, labelsFor } from "../lib/starter";
import { pct } from "../lib/format";

const SHOW_ME: Record<number, { to: string; label: string }> = {
  1: { to: "/inbox/T-dup-ticket", label: "18 → 20 Oct correction" },
  2: { to: "/inbox/T-test-data", label: "E08 draft and lint" },
  3: { to: "/inbox/QUARANTINE", label: "E05 quarantine" },
};

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-slate-600">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

function Cell({ label, pred, edited }: { label: unknown; pred: unknown; edited?: boolean }) {
  const same = label === pred;
  return (
    <td className={`py-1.5 pr-3 ${same ? "" : "bg-rose-50 text-rose-800"}`}>
      {String(pred)}
      {!same && <span className="block text-[11px] text-rose-600">label: {String(label)}</span>}
      {edited && <span className="block text-[11px] text-violet-600">edited</span>}
    </td>
  );
}

export default function JudgePage() {
  const run = useTriage((s) => s.run);
  if (!run) return <Empty>No inbox imported yet. <Link className="text-indigo-700 underline" to="/">Import the fixture</Link>.</Empty>;
  const { result } = run;
  const m = result.metrics; // the engine's own output, before any reviewer edits
  const labels = labelsFor(result.fixture_hash);
  const edits = Object.keys(run.decisionEdits).length;
  const afterReview = labels && edits ? computeMetrics(result, labels) : null;
  const byId = new Map(result.decisions.map((d) => [d.email_id, d]));
  const sameThread = (a: LabelRow, b: LabelRow) => (byId.get(a.email_id)?.thread_key ?? "?") === (byId.get(b.email_id)?.thread_key ?? "?");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Judge view</h1>
          <p className="text-sm text-slate-600">
            Engine output against <code className="rounded bg-slate-100 px-1">data/labels/C16_labels.json</code>, the ground truth we wrote for the 12 starter emails before building.
          </p>
        </div>
      </div>

      {!labels && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          This run is a changed input (hash {result.fixture_hash}). The labels describe the starter fixture only, so Check 1 is not scored here. Compare the triage with the expected behaviour written in{" "}
          <code>data/challenges/README.md</code>. Checks 2 and 3 still run.
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-3">
        {m.checks.map((c) => (
          <div key={c.id} className={`rounded-lg border bg-white p-4 shadow-sm ${c.passed === false ? "border-rose-300" : c.passed ? "border-emerald-300" : "border-slate-200"}`}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Check {c.id}</span>
              <Chip tone={c.passed === null ? "neutral" : c.passed ? "green" : "red"}>{c.passed === null ? "n/a" : c.passed ? "pass" : "fail"}</Chip>
            </div>
            <div className="mt-1 font-medium">{c.title}</div>
            <p className="mt-1 text-sm text-slate-600">{c.evidence}</p>
            {result.threads.some((t) => SHOW_ME[c.id].to.endsWith(t.thread_key)) && (
              <Link to={SHOW_ME[c.id].to} className="mt-2 inline-block text-sm font-medium text-indigo-700 hover:underline">
                Show me: {SHOW_ME[c.id].label} →
              </Link>
            )}
          </div>
        ))}
      </section>

      {m.labels_applied && (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Tile label="seeded critical items" value={`${m.seeded_recovered}/${m.seeded_total}`} sub="recall" />
            <Tile label="action-flag precision" value={pct(m.precision_action_flags)} sub="flagged = needed" />
            <Tile label="action-flag recall" value={pct(m.recall_action_flags)} />
            <Tile label="remaining decisions" value={pct(m.remaining_accuracy)} sub="non-seeded, all fields" />
            <Tile label="thread grouping" value={pct(m.thread_pair_agreement)} sub="pairwise agreement" />
          </section>
          {afterReview && (
            <p className="text-sm text-violet-700">
              {edits} decision(s) were edited by the reviewer. After review: seeded {afterReview.seeded_recovered}/{afterReview.seeded_total}, precision {pct(afterReview.precision_action_flags)}. The tiles show the engine's own output.
            </p>
          )}

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold">Seeded critical items (Check 1)</h2>
            <ul className="mt-2 divide-y divide-slate-100">
              {m.seeded.map((s) => (
                <li key={s.email_id} className="grid gap-1 py-2 text-sm sm:grid-cols-[4rem_1fr_1.2fr]">
                  <span className="flex items-center gap-2">
                    <span className={s.recovered ? "text-emerald-600" : "text-rose-600"}>{s.recovered ? "✓" : "✗"}</span>
                    <Link to={`/inbox/${encodeURIComponent(byId.get(s.email_id)?.thread_key ?? "")}#${s.email_id}`} className="font-mono font-semibold text-indigo-700 hover:underline">
                      {s.email_id}
                    </Link>
                  </span>
                  <span>{s.expected}</span>
                  <span className="text-xs text-slate-500">{s.detail}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold">Labels vs predictions, all 12 emails</h2>
            <p className="text-xs text-slate-500">Red cells differ from the label. Threads are compared by grouping, not by name.</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Email", "Thread (pred / label)", "Purpose", "Urgency", "Action", "Status"].map((h) => (
                      <th key={h} className="py-1 pr-3 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {LABELS.labels.map((l) => {
                    const d = byId.get(l.email_id) as Decision | undefined;
                    if (!d) return null;
                    const e = run.decisionEdits[l.email_id] ?? {};
                    const groupOk = LABELS.labels.every((o) => (o.thread_key === l.thread_key) === sameThread(o, l));
                    return (
                      <tr key={l.email_id} className="align-top">
                        <td className="py-1.5 pr-3 font-mono font-semibold">{l.email_id}</td>
                        <td className={`py-1.5 pr-3 font-mono text-xs ${groupOk ? "" : "bg-rose-50 text-rose-800"}`}>
                          {d.thread_key} <span className="text-slate-400">/ {l.thread_key}</span>
                        </td>
                        <Cell label={l.purpose} pred={d.purpose} edited={"purpose" in e} />
                        <Cell label={l.urgency} pred={d.urgency} edited={"urgency" in e} />
                        <Cell label={l.action_needed} pred={d.action_needed} edited={"action_needed" in e} />
                        <Cell label={l.status} pred={d.status} edited={"status" in e} />
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
