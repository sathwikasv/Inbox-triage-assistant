import { useState } from "react";
import { Link } from "react-router-dom";
import { CHALLENGES, STARTER_FIXTURE, STARTER_HASH } from "../lib/starter";
import { useTriage } from "../store/triage";
import { Chip } from "../components/Chips";

export default function ImportPage() {
  const { run, busy, importError, importFixture } = useTriage();
  const [dragging, setDragging] = useState(false);

  async function readFile(f: File) {
    // Pass the raw text so malformed JSON is reported by the same validator as schema errors.
    await importFixture(await f.text(), f.name);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Import an inbox file</h1>
        <p className="mt-1 text-slate-600">
          The file is validated, ordered by <code className="rounded bg-slate-100 px-1">received_at</code>, threaded by content and triaged. Nothing is ever sent:
          the tool only drafts replies and previews label/archive actions for a person to review.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <button
          disabled={busy}
          onClick={() => importFixture(STARTER_FIXTURE, "starter fixture (data/fixture/C16/fixture.json)")}
          className="rounded-lg border border-indigo-200 bg-indigo-600 p-5 text-left text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
        >
          <div className="text-lg font-semibold">Load starter fixture</div>
          <div className="mt-1 text-sm text-indigo-100">12 synthetic emails from case C16, with our ground-truth labels</div>
        </button>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) readFile(f);
          }}
          className={`flex cursor-pointer flex-col justify-center rounded-lg border-2 border-dashed p-5 text-sm ${dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white hover:border-slate-400"}`}
        >
          <span className="font-semibold text-slate-900">Upload a JSON file</span>
          <span className="mt-1 text-slate-600">Same schema as the fixture. Drop it here or click to choose.</span>
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readFile(f);
              e.target.value = "";
            }}
          />
        </label>
      </section>

      {CHALLENGES.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Changed inputs (judge challenges)</h2>
          <p className="text-xs text-slate-500">From data/challenges/. Expected behaviour is written in that folder's README before running.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CHALLENGES.map((c) => (
              <button
                key={c.name}
                disabled={busy}
                onClick={async () => importFixture(await c.load(), `challenge ${c.name}`)}
                className="rounded border border-slate-300 px-2 py-1 font-mono text-xs hover:bg-slate-50"
              >
                {c.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {importError && (
        <section role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <div className="font-semibold">{importError.title}</div>
          <p className="mt-1">Nothing was triaged or saved. Fix these fields and import again:</p>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {importError.issues.map((i, n) => (
              <li key={n}>
                <span className="font-semibold">{i.path}</span>: {i.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {run && !importError && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Imported: {run.source}</h2>
            {run.reused && <Chip tone="blue">same content as before: existing run reused, nothing duplicated</Chip>}
            {run.result.fixture_hash === STARTER_HASH ? <Chip tone="green">starter fixture: labels applied</Chip> : <Chip tone="amber">changed input: no labels</Chip>}
          </div>
          <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
            <dt className="text-slate-500">Fixture hash</dt>
            <dd className="font-mono">{run.result.fixture_hash}</dd>
            <dt className="text-slate-500">Emails</dt>
            <dd>
              {run.result.decisions.length} in {run.result.threads.length} threads
            </dd>
            <dt className="text-slate-500">Time order</dt>
            <dd className="flex flex-wrap gap-1 font-mono text-xs">
              {run.result.ordered_email_ids.map((id, i) => (
                <span key={id}>
                  {id}
                  {i < run.result.ordered_email_ids.length - 1 && <span className="text-slate-400"> →</span>}
                </span>
              ))}
            </dd>
          </dl>
          <p className="mt-2 text-xs text-slate-500">File order is not time order: E10 (08:00) arrived before E01 (09:00). Ties are broken by email id.</p>
          {run.result.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-amber-800">
              {run.result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <Link to="/triage" className="mt-4 inline-block rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
            Open triage →
          </Link>
        </section>
      )}
    </div>
  );
}
