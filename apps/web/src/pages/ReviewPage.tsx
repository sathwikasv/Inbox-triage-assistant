import { Link } from "react-router-dom";
import { useTriage } from "../store/triage";
import { Chip } from "../components/Chips";
import { Empty } from "../components/Banners";
import { formatStamp } from "../lib/format";

export default function ReviewPage() {
  const { run, busy, markReviewed, repo } = useTriage();
  if (!run) return <Empty>No inbox imported yet. <Link className="text-indigo-700 underline" to="/">Import the fixture</Link>.</Empty>;
  const { result } = run;
  const replyThreads = result.threads.filter((t) => t.draft_mode !== "none");
  const silentThreads = result.threads.filter((t) => t.draft_mode === "none");

  function download() {
    const payload = {
      run_id: run!.runId,
      source: run!.source,
      saved_at: run!.savedAt,
      policy: result.policy,
      threads: result.threads,
      decisions: result.decisions,
      drafts: result.drafts.map((d) => ({ ...d, reviewed_body: run!.edits[d.thread_key]?.body ?? d.body, edited: !!run!.edits[d.thread_key] })),
      decision_edits: run!.decisionEdits,
      audit: run!.audit,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `c16-reviewed-${result.fixture_hash}.json` });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Review and save</h1>
        <p className="text-sm text-slate-600">Check each draft, then save the reviewed result. Saving stores drafts, decision edits and the audit trail. It never sends anything.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Drafts to review ({replyThreads.length})</h2>
        <ul className="mt-2 divide-y divide-slate-100">
          {replyThreads.map((t) => {
            const edit = run.edits[t.thread_key];
            const draft = result.drafts.find((d) => d.thread_key === t.thread_key);
            const ok = edit ? edit.lint_ok : draft?.lint_ok;
            return (
              <li key={t.thread_key} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <Link to={`/thread/${encodeURIComponent(t.thread_key)}`} className="font-medium text-indigo-700 hover:underline">
                  {t.title}
                </Link>
                <span className="font-mono text-xs text-slate-500">{t.thread_key}</span>
                <Chip tone={edit ? "violet" : "neutral"}>{edit ? "edited" : "template"}</Chip>
                <Chip tone={ok ? "green" : "red"}>{ok ? "lint clean" : "lint failed"}</Chip>
                <span className="text-xs text-slate-500">{t.draft_mode === "ack" ? "acknowledgement" : "reply"}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          No draft by design: {silentThreads.map((t) => `${t.thread_key} (${t.draft_reason})`).join("; ")}.
        </p>
      </section>

      {Object.keys(run.decisionEdits).length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Decisions corrected by the reviewer</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {Object.entries(run.decisionEdits).map(([id, patch]) => (
              <li key={id}>
                <span className="font-mono font-semibold">{id}</span>: {Object.entries(patch).map(([k, v]) => `${k} → ${String(v)}`).join(", ")}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <button disabled={busy} onClick={markReviewed} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
          Save reviewed result
        </button>
        <button onClick={download} className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
          Download JSON
        </button>
        <span className="text-sm text-slate-600">
          {run.reviewed && run.savedAt
            ? `Saved ${formatStamp(run.savedAt)} ${repo.kind === "api" ? "to the API (MongoDB)" : "in this browser"}. Reload the page and it is still here.`
            : run.savedAt
              ? "Changed since the last save."
              : "Not saved yet."}
        </span>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Audit trail</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-1 pr-3 font-medium">When</th>
                <th className="py-1 pr-3 font-medium">Event</th>
                <th className="py-1 pr-3 font-medium">Item</th>
                <th className="py-1 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...run.audit].reverse().map((e, i) => (
                <tr key={i} className="align-top">
                  <td className="whitespace-nowrap py-1.5 pr-3 text-slate-500">{formatStamp(e.at)}</td>
                  <td className="py-1.5 pr-3">
                    <Chip tone={e.type === "quarantine" ? "danger" : e.type === "save" ? "green" : e.type.startsWith("preview") ? "blue" : "neutral"}>{e.type.replace("_", " ")}</Chip>
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-xs">{e.email_id ?? e.thread_key ?? ""}</td>
                  <td className="py-1.5 text-slate-700">{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
