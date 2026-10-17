import { useEffect, useMemo, useState } from "react";
import { lintDraft, type Draft, type ThreadFacts } from "@c16/core";
import { Chip } from "./Chips";
import { useTriage } from "../store/triage";
import type { DraftEdit } from "../repo";
import { MODEL_AVAILABLE, MODEL_VARIANTS } from "../lib/modelDrafts";

/** Draft review: live lint against the thread's facts; Save stays disabled while any forbidden claim is present. */
export function DraftEditor({ t, draft, edit }: { t: ThreadFacts; draft?: Draft; edit?: DraftEdit }) {
  const saveDraft = useTriage((s) => s.saveDraft);
  const busy = useTriage((s) => s.busy);
  const useModel = useTriage((s) => s.useModelDrafts);
  const setUseModel = useTriage((s) => s.setUseModelDrafts);

  // Model variants are pre-generated offline and still have to pass the same lint as any human edit.
  const variants = useMemo(() => (MODEL_VARIANTS[t.thread_key] ?? []).map((v) => ({ ...v, lint: lintDraft(v.body, t) })), [t]);
  const model = useModel ? variants.find((v) => v.lint.ok) : undefined;
  const rejected = variants.filter((v) => !v.lint.ok).length;

  const saved = edit?.body ?? model?.body ?? draft?.body ?? "";
  const [body, setBody] = useState(saved);
  const [serverViolations, setServerViolations] = useState<{ term: string; reason: string }[] | null>(null);
  useEffect(() => setBody(saved), [saved]);

  const lint = useMemo(() => lintDraft(body, t), [body, t]);
  const dirty = body !== (edit?.body ?? draft?.body ?? "");

  if (t.draft_mode === "none" || !draft) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
        <h2 className="font-semibold">Reply draft</h2>
        <p className="mt-1 text-slate-600">No draft: {t.draft_reason}.</p>
      </section>
    );
  }

  const sourceLabel = edit ? "edited by reviewer" : model ? `model-assisted (${model.source}, offline)` : "template (fallback)";

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Reply draft</h2>
        <Chip tone={model && !edit ? "violet" : "neutral"} title="Rules-based template by default; model variants are optional and pre-generated">
          {sourceLabel}
        </Chip>
        <Chip tone="amber">never sent: draft-only</Chip>
      </div>
      <p className="mt-1 text-xs text-slate-500">{t.draft_reason}</p>

      <label className={`mt-2 flex items-center gap-2 text-xs ${MODEL_AVAILABLE ? "text-slate-700" : "text-slate-400"}`}>
        <input type="checkbox" disabled={!MODEL_AVAILABLE || !!edit} checked={useModel && MODEL_AVAILABLE} onChange={(e) => setUseModel(e.target.checked)} />
        Use model-assisted draft
        <span className="text-slate-400">
          {!MODEL_AVAILABLE
            ? "(optional; no model output yet, so the template fallback is used)"
            : variants.length === 0
              ? "(no variant for this thread)"
              : `(${variants.length - rejected} usable${rejected ? `, ${rejected} rejected by lint` : ""})`}
        </span>
      </label>

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
            <li key={i}>
              Rejected on save: {v.term}: {v.reason}
            </li>
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
        <button disabled={body === saved} onClick={() => setBody(saved)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40">
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
