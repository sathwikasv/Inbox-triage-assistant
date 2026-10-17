import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertOctagon, ArrowRight, CheckCircle2, FileJson, FlaskConical, RefreshCcw, UploadCloud, Download, Sheet } from "lucide-react";
import { CHALLENGES, STARTER_FIXTURE, STARTER_HASH } from "../lib/starter";
import { useTriage } from "../store/triage";
import { fixtureToCsv } from "@c16/core";
import { downloadText } from "../lib/eml";
import { Badge, Button, cn } from "../ui";

export default function ImportPage() {
  const { run, busy, importError, importFixture } = useTriage();
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const read = async (f: File) => importFixture(await f.text(), f.name); // raw text: malformed JSON is reported like schema errors

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Data sources</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Import an inbox. It is validated, ordered by <code className="rounded bg-subtle px-1 font-mono text-xs">received_at</code>, threaded by content and triaged. Nothing is ever sent: replies are drafts and label/archive are previews.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card relative overflow-hidden p-5">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/10" />
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-brand-fg">
            <FileJson className="h-5 w-5" />
          </span>
          <h2 className="mt-4 font-semibold">C16 starter fixture</h2>
          <p className="mt-1 text-sm text-muted">12 synthetic emails with our ground-truth labels: corrections, duplicates, resolutions and one prompt injection.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge>12 emails</Badge>
            <Badge tone="green">labels</Badge>
            <Badge tone="red">1 injection</Badge>
          </div>
          <Button variant="primary" size="md" className="mt-5 w-full justify-center" disabled={busy} onClick={() => importFixture(STARTER_FIXTURE, "starter fixture (data/fixture/C16/fixture.json)")}>
            Load starter fixture
          </Button>
        </div>

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
            if (f) read(f);
          }}
          className={cn("card flex cursor-pointer flex-col items-center justify-center border-2 border-dashed p-5 text-center transition", dragging ? "border-brand bg-brand-soft" : "border-line hover:border-brand/40")}
        >
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-subtle text-muted">
            <UploadCloud className="h-6 w-6" />
          </span>
          <h2 className="mt-3 font-semibold">Upload JSON or CSV</h2>
          <p className="mt-1 text-sm text-muted">Same fields as the fixture. Drop a file here or click to browse.</p>
          <input
            type="file"
            accept="application/json,.json,text/csv,.csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) read(f);
              e.target.value = "";
            }}
          />
        </label>

        <div className="card p-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <Sheet className="h-5 w-5" />
          </span>
          <div className="mt-4 flex items-center gap-2">
            <h2 className="font-semibold">Spreadsheet (CSV)</h2>
            <Badge tone="green">supported</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            Columns <code className="rounded bg-subtle px-1 font-mono text-xs">email_id, subject, body, received_at</code>. Quoted fields may hold commas and line breaks; a blank time means unknown. Errors name the row.
          </p>
          <Button size="md" className="mt-5 w-full justify-center" onClick={() => downloadText("c16_inbox_template.csv", fixtureToCsv((STARTER_FIXTURE as { records: { emails: Parameters<typeof fixtureToCsv>[0] } }).records.emails), "text/csv")}>
            <Download className="h-4 w-4" /> Download CSV template
          </Button>
        </div>
      </div>

      {CHALLENGES.length > 0 && (
        <section className="card p-5">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-semibold">Changed inputs (judge challenges)</h2>
          </div>
          <p className="mt-1 text-sm text-muted">From data/challenges/. The expected behaviour is written in that folder's README before running.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {CHALLENGES.map((c) => (
              <button key={c.name} disabled={busy} onClick={async () => importFixture(await c.load(), `challenge ${c.name}`)} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-left text-sm hover:border-brand/40 hover:bg-subtle">
                <FileJson className="h-4 w-4 text-muted" />
                <span className="truncate font-mono text-xs">{c.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {importError && (
        <section role="alert" className="card border-rose-500/40 p-5">
          <div className="flex items-start gap-3">
            <AlertOctagon className="mt-0.5 h-5 w-5 text-rose-600" />
            <div className="flex-1">
              <h2 className="font-semibold text-rose-700 dark:text-rose-300">{importError.title}</h2>
              <p className="text-sm text-muted">Nothing was triaged or saved. Fix these fields and import again.</p>
              <ul className="mt-3 divide-y divide-line rounded-lg border border-line font-mono text-xs">
                {importError.issues.map((i, n) => (
                  <li key={n} className="px-3 py-2">
                    <span className="font-semibold">{i.path}</span>: {i.message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {run && !importError && (
        <section className="card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h2 className="font-semibold">Imported: {run.source}</h2>
            {run.reused && (
              <Badge tone="blue">
                <RefreshCcw className="h-3 w-3" /> same content: existing run reused
              </Badge>
            )}
            {run.result.fixture_hash === STARTER_HASH ? <Badge tone="green">starter fixture: labels applied</Badge> : <Badge tone="amber">changed input: no labels</Badge>}
            <Button variant="primary" className="ml-auto" onClick={() => navigate("/inbox")}>
              Open inbox <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <dl className="mt-4 grid gap-4 sm:grid-cols-4">
            {[
              ["Emails", run.result.decisions.length],
              ["Threads", run.result.threads.length],
              ["Drafts", run.result.drafts.length],
              ["Fixture hash", run.result.fixture_hash],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-xl bg-subtle p-3">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4">
            <div className="label-xs mb-2">Time order (file order is not time order)</div>
            <div className="flex flex-wrap items-center gap-1">
              {run.result.ordered_email_ids.map((id, i) => (
                <span key={id} className="flex items-center gap-1">
                  <span className={cn("rounded-md px-1.5 py-0.5 font-mono text-xs", i === 0 ? "bg-brand text-brand-fg" : "bg-subtle")}>{id}</span>
                  {i < run.result.ordered_email_ids.length - 1 && <ArrowRight className="h-3 w-3 text-muted" />}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">E10 (08:00) arrived before E01 (09:00). Ties are broken by email id.</p>
          </div>
          {run.result.warnings.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-sm text-amber-700 dark:text-amber-300">
              {run.result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
