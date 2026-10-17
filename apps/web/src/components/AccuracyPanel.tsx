import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import { runTriage, type Purpose } from "@c16/core";
import robustness from "../../../../packages/core/tests/fixtures/robustness.json";
import dev from "../../../../packages/core/tests/fixtures/heldout.json";
import heldoutV2 from "../../../../packages/core/tests/fixtures/heldout_v2.json";
import starter from "../../../../data/fixture/C16/fixture.json";
import { LABELS } from "../lib/starter";
import { Meter } from "./charts";
import { PURPOSE_LABEL, Segmented, cn } from "../ui";

type Row = { id: string; purpose: string; body: string };
const TYPES = Object.keys(PURPOSE_LABEL) as Purpose[];

const fixtureRows: Row[] = starter.records.emails.map((e) => ({ id: e.email_id, body: e.body, purpose: LABELS.labels.find((l) => l.email_id === e.email_id)!.purpose }));

const SETS = [
  { id: "v2", label: "Held-out v2", n: heldoutV2.emails.length, rows: heldoutV2.emails as Row[], note: "committed before tuning, scored once" },
  { id: "dev", label: "Dev set v1", n: dev.emails.length, rows: dev.emails as Row[], note: "seen while tuning" },
  { id: "rob", label: "Robustness", n: robustness.emails.length, rows: robustness.emails as Row[], note: "tuning set" },
  { id: "fx", label: "Fixture E01–E12", n: fixtureRows.length, rows: fixtureRows, note: "the judged input" },
] as const;

function classifyAll(rows: Row[]) {
  return rows.map((e) => {
    const r = runTriage({ case_id: "C16", records: { emails: [{ email_id: e.id, subject: "-", body: e.body, received_at: "2026-10-16T10:00:00+05:30" }], policy: { draft_only: true, auto_send: false } } });
    return { ...e, got: r.decisions[0].purpose };
  });
}

/** Email-type accuracy, recomputed in the browser from the evaluation sets in the repo. */
export function AccuracyPanel() {
  const results = useMemo(() => Object.fromEntries(SETS.map((s) => [s.id, classifyAll([...s.rows])])), []);
  const [setId, setSetId] = useState<(typeof SETS)[number]["id"]>("v2");
  const rows = results[setId];
  const matrix = TYPES.map((want) => TYPES.map((got) => rows.filter((x) => x.purpose === want && x.got === got).length));
  const max = Math.max(1, ...matrix.flat());
  const misses = rows.filter((x) => x.got !== x.purpose);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <Target className="h-4 w-4 text-brand" />
        <div className="flex-1">
          <h2 className="text-sm font-semibold">Email-type accuracy (segregation)</h2>
          <p className="text-xs text-muted">Recomputed live in this browser: each email triaged on its own by the shipped rules. Synthetic sets written by the team; not a benchmark.</p>
        </div>
      </div>
      <div className="grid gap-6 p-5 lg:grid-cols-[18rem_1fr]">
        <div className="space-y-4">
          {SETS.map((s) => {
            const ok = results[s.id].filter((x) => x.got === x.purpose).length;
            return (
              <button key={s.id} onClick={() => setSetId(s.id)} className={cn("block w-full rounded-xl border p-3 text-left transition", setId === s.id ? "border-brand bg-brand-soft/60" : "border-line hover:bg-subtle")}>
                <Meter label={s.label} value={ok} max={s.n} display={`${ok}/${s.n} · ${Math.round((ok / s.n) * 100)}%`} />
                <div className="mt-1 text-[11px] text-muted">{s.note}</div>
              </button>
            );
          })}
          <p className="text-xs leading-relaxed text-muted">Before tuning, the same rules scored 34/60 on held-out v2 and 10/40 on the dev set. When no rule matches, an email goes to Needs review instead of being guessed.</p>
        </div>

        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="label-xs">Confusion matrix</span>
            <Segmented value={setId} onChange={setSetId} options={SETS.map((s) => ({ value: s.id, label: s.label }))} />
          </div>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-[2px] text-[11px]">
              <thead>
                <tr>
                  <th className="pr-2 text-right font-medium text-muted">expected ↓ · got →</th>
                  {TYPES.map((t) => (
                    <th key={t} className="h-16 w-9 align-bottom font-medium text-muted">
                      <span className="inline-block -rotate-45 whitespace-nowrap">{PURPOSE_LABEL[t]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TYPES.map((want, i) => (
                  <tr key={want}>
                    <th className="whitespace-nowrap pr-2 text-right font-medium text-fg/80">{PURPOSE_LABEL[want]}</th>
                    {TYPES.map((got, j) => {
                      const n = matrix[i][j];
                      const diag = i === j;
                      return (
                        <td
                          key={got}
                          title={`${n} email(s): expected ${PURPOSE_LABEL[want]}, got ${PURPOSE_LABEL[got]}`}
                          className={cn("h-8 w-9 rounded-[4px] text-center tabular-nums", n === 0 ? "bg-subtle text-muted/50" : diag ? "font-semibold" : "font-semibold ring-2 ring-inset ring-rose-500")}
                          style={n ? { background: `rgb(var(--series-1) / ${0.15 + 0.75 * (n / max)})`, color: n / max > 0.5 ? "white" : undefined } : undefined}
                        >
                          {n || "·"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-xs text-muted">
            {misses.length === 0 ? (
              "No misclassified emails in this set: every count sits on the diagonal."
            ) : (
              <ul className="space-y-1">
                {misses.map((m) => (
                  <li key={m.id}>
                    <span className="font-mono">{m.id}</span>: expected {m.purpose}, got {m.got}. "{m.body}"
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
