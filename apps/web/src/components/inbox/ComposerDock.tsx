import { forwardRef, useEffect, useMemo, useState } from "react";
import { BadgeCheck, ChevronDown, ChevronUp, Lock, Paperclip, RotateCcw, Save, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import { lintDraft, suggestFixes, type Draft, type ThreadFacts } from "@c16/core";
import { useTriage } from "../../store/triage";
import { can } from "../../lib/permissions";
import type { DraftEdit } from "../../repo";
import { MODEL_AVAILABLE, MODEL_VARIANTS } from "../../lib/modelDrafts";
import { Badge, Button, Tip, cn } from "../../ui";

/** A draft that states a date, a commitment or sits on an escalated thread needs an Approver's sign-off. */
export function needsApproval(body: string, t: ThreadFacts): boolean {
  return /\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)\b/.test(body) || /\b(we|i) will\b/i.test(body) || t.escalations.length > 0;
}

export const ComposerDock = forwardRef<HTMLTextAreaElement, { t: ThreadFacts; draft?: Draft; edit?: DraftEdit; expanded: boolean; onExpanded: (v: boolean) => void }>(function ComposerDock({ t, draft, edit, expanded, onExpanded }, ref) {
  const { saveDraft, approveDraft, busy, role, run, useModelDrafts, setUseModelDrafts } = useTriage();
  const variants = useMemo(() => (MODEL_VARIANTS[t.thread_key] ?? []).map((v) => ({ ...v, lint: lintDraft(v.body, t) })), [t]);
  const model = useModelDrafts ? variants.find((v) => v.lint.ok) : undefined;
  const saved = edit?.body ?? model?.body ?? draft?.body ?? "";
  const [body, setBody] = useState(saved);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [rejected, setRejected] = useState<{ term: string; reason: string }[] | null>(null);
  useEffect(() => {
    setBody(saved);
    setDismissed([]);
    setRejected(null);
  }, [saved, t.thread_key]);

  const lint = useMemo(() => lintDraft(body, t), [body, t]);
  const suggestions = useMemo(() => suggestFixes(body, t).filter((s) => !dismissed.includes(s.id)), [body, t, dismissed]);
  const dirty = body !== (edit?.body ?? draft?.body ?? "");
  const editable = can(role, "edit_draft");
  const approval = run?.approvals?.[t.thread_key];
  const mustApprove = needsApproval(edit?.body ?? draft?.body ?? "", t);

  if (t.draft_mode === "none" || !draft) {
    return (
      <div className="border-t border-line bg-surface px-5 py-3 text-sm text-muted">
        <span className="font-medium text-fg">No reply needed.</span> {t.draft_reason}.
      </div>
    );
  }

  const status = approval ? (
    <Badge tone="green">
      <BadgeCheck className="h-3 w-3" /> Approved
    </Badge>
  ) : mustApprove ? (
    <Badge tone="amber">Needs approval</Badge>
  ) : (
    <Badge>No approval needed</Badge>
  );

  return (
    <div className="border-t border-line bg-surface shadow-[0_-8px_24px_-12px_rgb(16_24_40/0.15)]">
      <button onClick={() => onExpanded(!expanded)} className="flex w-full items-center gap-2 px-5 py-2.5 text-left text-sm" aria-expanded={expanded}>
        <Wand2 className="h-4 w-4 text-brand" />
        <span className="font-semibold">{t.draft_mode === "ack" ? "Acknowledgement draft" : "Reply draft"}</span>
        <Badge tone={edit ? "violet" : model ? "violet" : "neutral"}>{edit ? "edited" : model ? "model-assisted" : "template"}</Badge>
        {status}
        {suggestions.length > 0 && (
          <Badge tone={suggestions.some((s) => s.kind === "fix") ? "red" : "brand"}>
            <Sparkles className="h-3 w-3" /> {suggestions.length} suggestion{suggestions.length > 1 ? "s" : ""}
          </Badge>
        )}
        <span className="ml-auto text-muted">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</span>
      </button>

      {expanded && (
        <div className="max-h-[46vh] overflow-y-auto px-5 pb-4">
          {suggestions.length > 0 && editable && (
            <div className="mb-3 grid gap-2">
              {suggestions.map((s) => (
                <div key={s.id} className={cn("animate-fade-in rounded-xl border p-3", s.kind === "fix" ? "border-rose-500/30 bg-rose-500/[0.04]" : "border-brand/25 bg-brand-soft/60")}>
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    {s.kind === "fix" ? <TriangleAlert className="h-3.5 w-3.5 text-rose-600" /> : <Sparkles className="h-3.5 w-3.5 text-brand" />}
                    {s.title}
                  </div>
                  <p className="mt-1.5 text-sm leading-6">
                    {s.before && <span className="rounded bg-rose-500/10 px-0.5 text-rose-700 line-through decoration-rose-400 dark:text-rose-300">{s.before}</span>}
                    {s.before && s.after && " → "}
                    {s.after && <span className="rounded bg-emerald-500/10 px-0.5 font-medium text-emerald-700 dark:text-emerald-300">{s.after}</span>}
                  </p>
                  <div className="mt-2 flex gap-1.5">
                    <Button size="xs" variant="success" onClick={() => setBody(s.apply(body))}>
                      Accept
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setDismissed((d) => [...d, s.id])}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <label htmlFor={`draft-${t.thread_key}`} className="sr-only">
            Draft body
          </label>
          <textarea
            ref={ref}
            id={`draft-${t.thread_key}`}
            readOnly={!editable}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setRejected(null);
            }}
            rows={6}
            className={cn(
              "w-full resize-y rounded-xl border bg-canvas/40 p-3.5 text-[15px] leading-7 outline-none transition focus:bg-surface",
              lint.ok ? "border-line focus:border-brand/50 focus:ring-4 focus:ring-brand/10" : "border-rose-400 focus:ring-4 focus:ring-rose-500/10",
              !editable && "cursor-not-allowed opacity-80",
            )}
          />
          {!editable && <p className="mt-1 text-xs text-muted">Viewers cannot edit drafts. Switch role in the account menu.</p>}
          {!lint.ok && (
            <ul className="mt-2 space-y-1" aria-live="polite">
              {lint.violations.map((v, i) => (
                <li key={i} className="flex items-start gap-2 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-sm text-rose-800 dark:text-rose-200">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <b className="font-mono">"{v.term}"</b>: {v.reason}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {rejected?.map((v, i) => (
            <p key={i} className="mt-1 text-sm text-rose-700">
              Rejected on save: {v.term}: {v.reason}
            </p>
          ))}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" size="md" disabled={!editable || !lint.ok || !dirty || busy} onClick={async () => setRejected(await saveDraft(t.thread_key, body))}>
              <Save className="h-4 w-4" /> Save draft
            </Button>
            {role === "approver" ? (
              <Button variant="success" size="md" disabled={!!approval || dirty || !lint.ok || busy} onClick={() => approveDraft(t.thread_key)}>
                <BadgeCheck className="h-4 w-4" /> {approval ? "Approved" : "Approve"}
              </Button>
            ) : (
              mustApprove && (
                <Tip content="Only an Approver can sign off drafts with dates, commitments or escalations. Switch role in the account menu.">
                  <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                    <BadgeCheck className="h-4 w-4" /> Approver sign-off required
                  </span>
                </Tip>
              )
            )}
            <Tip content="Discard unsaved changes">
              <Button size="icon" variant="ghost" disabled={body === saved} onClick={() => setBody(saved)} aria-label="Discard changes">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </Tip>
            {edit && (
              <Button size="sm" variant="ghost" onClick={() => setBody(draft.body)}>
                Restore template
              </Button>
            )}
            <Tip content="Attachments are off: the tool never sends files">
              <span>
                <Button size="icon" variant="ghost" disabled aria-label="Attach file">
                  <Paperclip className="h-4 w-4" />
                </Button>
              </span>
            </Tip>
            {MODEL_AVAILABLE && (
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" disabled={!!edit} checked={useModelDrafts} onChange={(e) => setUseModelDrafts(e.target.checked)} /> model variant
              </label>
            )}
            <Tip content="Sending is disabled by policy (draft_only = true). A future release needs approval and escalation controls first.">
              <span className="ml-auto">
                <button disabled className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-line px-3.5 text-sm font-medium text-muted">
                  <Lock className="h-3.5 w-3.5" /> Send
                </button>
              </span>
            </Tip>
          </div>
          <p className="mt-2 text-xs text-muted">{!lint.ok ? "Accept a suggestion or fix the flagged claims to save." : dirty ? "Lint clean: ready to save." : approval ? "Approved draft. It stays a draft: nothing is sent." : "Draft only: saved for a person to send later."}</p>
        </div>
      )}
    </div>
  );
});
