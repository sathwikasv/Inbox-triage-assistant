import { useEffect, useMemo, useState } from "react";
import { lintDraft, type Draft, type ThreadFacts } from "@c16/core";
import { Chip } from "./Chips";
import { useTriage } from "../store/triage";
import type { DraftEdit } from "../repo";

/** Draft review: live lint against the thread's facts; Save stays disabled while any forbidden claim is present. */
export function DraftEditor({ t, draft, edit }: { t: ThreadFacts; draft?: Draft; edit?: DraftEdit }) {
  const saveDraft = useTriage((s) => s.saveDraft);
  const busy = useTriage((s) => s.busy);
  const saved = edit?.body ?? draft?.body ?? "";
  const [body, setBody] = useState(saved);
  const [serverViolations, setServerViolations] = useState<{ term: string; reason: string }[] | null>(null);
  useEffect(() => setBody(saved), [saved]);

  const lint = useMemo(() => lintDraft(body, t), [body, t]);
  const dirty = body !== saved;

  if (t.draft_mode === "none" || !draft) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
        <h2 className="font-semibold">Reply draft</h2>
        <p className="mt-1 text-slate-600">No draft: {t.draft_reason}.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Reply draft</h2>
        <Chip tone="neutral" title="Rules-based template; the optional model-assisted variants are not used by default">
          {edit ? "edited by reviewer" : "template (fallback)"}
        </Chip>
        <Chip tone="amber">never sent: draft-only</Chip>
      </div>
      <p className="mt-1 text-xs text-slate-500">{t.draft_reason}</p>
      <label htmlFor={`draft-${t.thread_key}`} className="sr-only">
        Draft body
      </label>
      <textarea
        id={`draft-${t.thread_key}`}
        className={`mt-2 h-56 w-full rounded-md border p-3 font-sans text-sm leading-relaxed focus:outline-none focus:ring-2 ${lint.ok ? "border-slate-300 focus:ring-indigo-300" : "border-rose-400 focus:ring-rose-300"}`}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setServerViolations(null);
        }}
      />
      {!lint.ok && (
        <ul className="mt-2 space-y-1 text-sm text-rose-800" aria-live="polite">
          {lint.violations.map((v, i) => (
            <li key={i} className="rounded bg-rose-50 px-2 py-1">
              <span className="font-mono font-semibold">"{v.term}"</span>: {v.reason}
            </li>
          ))}
        </ul>
      )}
      {serverViolations && (
        <ul className="mt-2 space-y-1 text-sm text-rose-800">
          {serverViolations.map((v, i) => (
            <li key={i}>Rejected on save: {v.term}: {v.reason}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          disabled={!lint.ok || !dirty || busy}
          onClick={async () => setServerViolations(await saveDraft(t.thread_key, body))}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Save draft
        </button>
        <button disabled={!dirty} onClick={() => setBody(saved)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40">
          Discard changes
        </button>
        {edit && (
          <button onClick={() => setBody(draft.body)} className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            Restore template text
          </button>
        )}
        <span className="text-xs text-slate-500">{!lint.ok ? "Fix the flagged claims to save." : dirty ? "Lint clean: ready to save." : edit ? "Saved." : "Template text; edit to change."}</span>
      </div>
    </section>
  );
}
