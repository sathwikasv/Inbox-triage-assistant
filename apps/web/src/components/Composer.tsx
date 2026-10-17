import { forwardRef, useEffect, useMemo, useState } from "react";
import { lintDraft, suggestFixes, type Draft, type ThreadFacts } from "@c16/core";
import { Chip } from "./Chips";
import { Icon } from "./Icons";
import { useTriage } from "../store/triage";
import type { DraftEdit } from "../repo";
import { MODEL_AVAILABLE, MODEL_VARIANTS } from "../lib/modelDrafts";

/**
 * Reply composer: live lint, Accept/Dismiss suggestions grounded in the thread facts, and a Send button
 * that stays locked (draft-only policy). Save is disabled while any forbidden claim is present.
 */
export const Composer = forwardRef<HTMLTextAreaElement, { t: ThreadFacts; draft?: Draft; edit?: DraftEdit }>(function Composer({ t, draft, edit }, ref) {
  const saveDraft = useTriage((s) => s.saveDraft);
  const busy = useTriage((s) => s.busy);
  const useModel = useTriage((s) => s.useModelDrafts);
  const setUseModel = useTriage((s) => s.setUseModelDrafts);

  const variants = useMemo(() => (MODEL_VARIANTS[t.thread_key] ?? []).map((v) => ({ ...v, lint: lintDraft(v.body, t) })), [t]);
  const model = useModel ? variants.find((v) => v.lint.ok) : undefined;
  const saved = edit?.body ?? model?.body ?? draft?.body ?? "";
  const [body, setBody] = useState(saved);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [serverViolations, setServerViolations] = useState<{ term: string; reason: string }[] | null>(null);
  useEffect(() => {
    setBody(saved);
    setDismissed([]);
  }, [saved, t.thread_key]);

  const lint = useMemo(() => lintDraft(body, t), [body, t]);
  const suggestions = useMemo(() => suggestFixes(body, t).filter((s) => !dismissed.includes(s.id)), [body, t, dismissed]);
  const dirty = body !== (edit?.body ?? draft?.body ?? "");

  if (t.draft_mode === "none" || !draft) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
        <h3 className="font-semibold">Reply</h3>
        <p className="mt-1 text-slate-600">No reply drafted: {t.draft_reason}.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <Icon name="reply" className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold">{t.draft_mode === "ack" ? "Acknowledgement" : "Reply"} draft</h3>
        <Chip tone={edit ? "violet" : model ? "violet" : "neutral"}>{edit ? "edited by reviewer" : model ? `model-assisted (${model.source})` : "template"}</Chip>
        <Chip tone="amber">never sent automatically</Chip>
        {MODEL_AVAILABLE && (
          <label className="ml-auto flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" disabled={!!edit} checked={useModel} onChange={(e) => setUseModel(e.target.checked)} /> model variant
          </label>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          {suggestions.map((s) => (
            <div key={s.id} className={`rounded-lg border bg-white p-2.5 shadow-sm ${s.kind === "fix" ? "border-rose-200" : "border-indigo-200"}`}>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Icon name={s.kind === "fix" ? "alert" : "sparkle"} className={`h-3.5 w-3.5 ${s.kind === "fix" ? "text-rose-600" : "text-indigo-600"}`} />
                {s.title}
              </div>
              <p className="mt-1 text-sm leading-relaxed">
                {s.before && <span className="bg-rose-50 text-rose-700 line-through decoration-rose-400">{s.before}</span>}
                {s.before && s.after && " "}
                {s.after && <span className="bg-emerald-50 font-medium text-emerald-800">{s.after}</span>}
              </p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => setBody(s.apply(body))} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700">
                  Accept
                </button>
                <button onClick={() => setDismissed((d) => [...d, s.id])} className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-3">
        <label htmlFor={`draft-${t.thread_key}`} className="sr-only">
          Draft body
        </label>
        <textarea
          ref={ref}
          id={`draft-${t.thread_key}`}
          className={`h-52 w-full resize-y rounded-lg border p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 ${lint.ok ? "border-slate-300 focus:ring-indigo-300" : "border-rose-400 focus:ring-rose-300"}`}
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
        {serverViolations?.map((v, i) => (
          <p key={i} className="mt-1 text-sm text-rose-800">
            Rejected on save: {v.term}: {v.reason}
          </p>
        ))}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            disabled={!lint.ok || !dirty || busy}
            onClick={async () => setServerViolations(await saveDraft(t.thread_key, body))}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Save draft
          </button>
          <button disabled={body === saved} onClick={() => setBody(saved)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40">
            Discard changes
          </button>
          {edit && (
            <button onClick={() => setBody(draft.body)} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
              Restore template
            </button>
          )}
          <button
            disabled
            title="Sending is off: this tool is draft-only. A future release needs an Approver role and escalation controls first."
            className="ml-auto inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-400"
          >
            <Icon name="lock" className="h-3.5 w-3.5" /> Send
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">{!lint.ok ? "Fix the flagged claims (or accept a suggestion) to save." : dirty ? "Lint clean: ready to save." : edit ? "Saved." : "Template text; edit or accept suggestions."}</p>
      </div>
    </section>
  );
});
