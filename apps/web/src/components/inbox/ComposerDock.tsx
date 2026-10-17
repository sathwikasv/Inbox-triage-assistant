import { forwardRef, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Check, ChevronDown, ChevronUp, Copy, Download, Lock, MailCheck, Paperclip, Quote, RotateCcw, Save, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import { TONES, lintDraft, needsApproval, suggestFixes, type Draft, type DraftTone, type ThreadFacts } from "@c16/core";
import { useTriage } from "../../store/triage";
import { can } from "../../lib/permissions";
import type { DraftEdit } from "../../repo";
import { MODEL_AVAILABLE, MODEL_VARIANTS } from "../../lib/modelDrafts";
import { burdenOf } from "../../lib/burden";
import { buildEml, downloadText, quoteOriginal, replySubject } from "../../lib/eml";
import { Badge, Button, Segmented, Tip, cn } from "../../ui";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = Object.assign(document.createElement("textarea"), { value: text });
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}

function Step({ done, active, label }: { done: boolean; active: boolean; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn("grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold", done ? "bg-emerald-500 text-white" : active ? "bg-brand text-brand-fg" : "bg-line text-muted")}>{done ? <Check className="h-2.5 w-2.5" /> : ""}</span>
      <span className={cn("text-[11px]", done ? "text-fg" : active ? "font-semibold text-brand" : "text-muted")}>{label}</span>
    </li>
  );
}

export const ComposerDock = forwardRef<HTMLTextAreaElement, { t: ThreadFacts; draft?: Draft; edit?: DraftEdit; expanded: boolean; onExpanded: (v: boolean) => void }>(function ComposerDock({ t, draft, edit, expanded, onExpanded }, ref) {
  const { saveDraft, approveDraft, handoff, markReplied, busy, role, run, useModelDrafts, setUseModelDrafts } = useTriage();
  const variants = useMemo(() => (MODEL_VARIANTS[t.thread_key] ?? []).map((v) => ({ ...v, lint: lintDraft(v.body, t) })), [t]);
  const model = useModelDrafts ? variants.find((v) => v.lint.ok) : undefined;
  const saved = edit?.body ?? model?.body ?? draft?.body ?? "";
  const [body, setBody] = useState(saved);
  const [tone, setTone] = useState<DraftTone>("standard");
  const [quote, setQuote] = useState(true);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [rejected, setRejected] = useState<{ term: string; reason: string }[] | null>(null);
  useEffect(() => {
    setBody(saved);
    setDismissed([]);
    setRejected(null);
  }, [saved, t.thread_key]);
  useEffect(() => setTone("standard"), [t.thread_key]);

  const lint = useMemo(() => lintDraft(body, t), [body, t]);
  const suggestions = useMemo(() => suggestFixes(body, t).filter((s) => !dismissed.includes(s.id)), [body, t, dismissed]);
  const savedBody = edit?.body ?? draft?.body ?? "";
  const dirty = body !== savedBody;
  const editable = can(role, "edit_draft");
  const approval = run?.approvals?.[t.thread_key];
  const reply = run?.replies?.[t.thread_key];
  const gate = needsApproval(savedBody, t);
  const target = draft?.reply_to ? run?.result.decisions.find((d) => d.email_id === draft.reply_to!.email_id) : undefined;
  const burden = draft ? burdenOf(draft, body) : null;

  if (t.draft_mode === "none" || !draft) {
    return (
      <div className="border-t border-line bg-surface px-5 py-3 text-sm text-muted">
        <span className="font-medium text-fg">No reply needed.</span> {t.draft_reason}.
      </div>
    );
  }

  // Permission control before a reply leaves the tool: saved, lint clean, and approved when the rule says so.
  const blockedBy = !can(role, "edit_draft")
    ? "Viewers cannot hand off replies."
    : dirty
      ? "Save the draft first."
      : !lint.ok
        ? "Fix the flagged claims first."
        : gate.needed && !approval
          ? `Needs Approver sign-off: ${gate.reasons.join(", ")}.`
          : null;
  const outgoing = quote && target ? `${savedBody}\n\n${quoteOriginal(target.email_id, target.received_at, target.body)}` : savedBody;
  const subject = replySubject(draft.reply_to?.subject ?? t.title);

  const doHandoff = async (how: "copy" | "eml") => {
    if (!(await handoff(t.thread_key, how))) return;
    if (how === "copy") await copyText(`Subject: ${subject}\n\n${outgoing}`);
    else downloadText(`reply-${t.thread_key}.eml`, buildEml({ subject: draft.reply_to?.subject ?? t.title, inReplyTo: draft.reply_to?.email_id ?? t.thread_key, body: savedBody, quoted: quote && target ? quoteOriginal(target.email_id, target.received_at, target.body) : undefined }), "message/rfc822");
  };

  const status = reply?.replied_at ? (
    <Badge tone="green">
      <MailCheck className="h-3 w-3" /> Replied
    </Badge>
  ) : reply ? (
    <Badge tone="blue">Handed off</Badge>
  ) : approval ? (
    <Badge tone="green">
      <BadgeCheck className="h-3 w-3" /> Approved
    </Badge>
  ) : gate.needed ? (
    <Badge tone="amber">Needs approval</Badge>
  ) : (
    <Badge>No approval needed</Badge>
  );

  return (
    <div className="border-t border-line bg-surface shadow-[0_-8px_24px_-12px_rgb(16_24_40/0.15)]">
      <button onClick={() => onExpanded(!expanded)} className="flex w-full items-center gap-2 px-5 py-2.5 text-left text-sm" aria-expanded={expanded}>
        <Wand2 className="h-4 w-4 text-brand" />
        <span className="font-semibold">{t.draft_mode === "ack" ? "Acknowledgement" : "Reply"}</span>
        {draft.reply_to && <span className="hidden truncate text-xs text-muted sm:inline">to {draft.reply_to.email_id} · {subject}</span>}
        <Badge tone={edit ? "violet" : model ? "violet" : "neutral"}>{edit ? "edited" : model ? "model-assisted" : "template"}</Badge>
        {status}
        {suggestions.length > 0 && (
          <Badge tone={suggestions.some((s) => s.kind === "fix") ? "red" : "brand"}>
            <Sparkles className="h-3 w-3" /> {suggestions.length}
          </Badge>
        )}
        <span className="ml-auto text-muted">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</span>
      </button>

      {expanded && (
        <div className="max-h-[52vh] overflow-y-auto px-5 pb-4">
          {/* Reply header and progress */}
          <div className="mb-3 rounded-xl border border-line bg-subtle/60 px-3.5 py-2.5 text-sm">
            <div className="grid gap-x-3 gap-y-1 sm:grid-cols-[4.5rem_1fr]">
              <span className="text-muted">To</span>
              <span>
                Sender of {draft.reply_to?.email_id ?? "this thread"} <span className="text-xs text-muted">(address not in the import; filled in your mail app)</span>
              </span>
              <span className="text-muted">Subject</span>
              <span className="font-medium">{subject}</span>
              <span className="text-muted">Answers</span>
              <span className="truncate text-muted">
                {target ? (
                  <>
                    <span className="font-mono text-xs text-fg">{target.email_id}</span> · {target.body}
                  </>
                ) : (
                  t.title
                )}
              </span>
            </div>
            <ol className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2">
              <Step done={!!edit || !!reply} active={!edit && !reply} label="Draft" />
              <Step done={!!edit && !dirty} active={dirty} label="Saved" />
              {gate.needed && <Step done={!!approval} active={!approval && !!edit && !dirty} label="Approved" />}
              <Step done={!!reply} active={!reply && !blockedBy} label="Handed off" />
              <Step done={!!reply?.replied_at} active={!!reply && !reply.replied_at} label="Replied" />
            </ol>
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="label-xs">Tone</span>
            <Segmented
              value={tone}
              onChange={(v) => {
                setTone(v);
                if (draft.tones[v] && editable) setBody(draft.tones[v]!);
              }}
              options={TONES.filter((x) => draft.tones[x.id]).map((x) => ({ value: x.id, label: x.label }))}
            />
            <span className="text-xs text-muted">{TONES.find((x) => x.id === tone)?.hint} · same facts in every tone</span>
          </div>

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
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            {burden && (
              <Tip content="Draft correction burden: share of words changed from the closest suggested tone (the pilot metric).">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
                    <span className="block h-full rounded-full bg-[rgb(var(--series-1))]" style={{ width: `${Math.round(burden.ratio * 100)}%` }} />
                  </span>
                  {burden.ratio === 0 ? "as suggested" : `${Math.round(burden.ratio * 100)}% changed (${burden.changed_words} words)`}
                </span>
              </Tip>
            )}
            {target && (
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={quote} onChange={(e) => setQuote(e.target.checked)} />
                <Quote className="h-3 w-3" /> Quote {target.email_id} below the reply
              </label>
            )}
            {!editable && <span>Viewers cannot edit drafts. Switch role in the account menu.</span>}
          </div>
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
            {role === "approver" && gate.needed && (
              <Button variant="success" size="md" disabled={!!approval || dirty || !lint.ok || busy} onClick={() => approveDraft(t.thread_key)}>
                <BadgeCheck className="h-4 w-4" /> {approval ? "Approved" : "Approve"}
              </Button>
            )}
            {role !== "approver" && gate.needed && !approval && (
              <Tip content={`Only an Approver can sign off a reply that ${gate.reasons.join(", ")}. Switch role in the account menu.`}>
                <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                  <BadgeCheck className="h-4 w-4" /> Approver sign-off required
                </span>
              </Tip>
            )}
            <Tip content={blockedBy ?? "Copy the reply and subject to paste into your mail app"}>
              <span>
                <Button size="md" disabled={!!blockedBy || busy} onClick={() => doHandoff("copy")}>
                  <Copy className="h-4 w-4" /> Copy
                </Button>
              </span>
            </Tip>
            <Tip content={blockedBy ?? "Download an unsent .eml draft; it opens in Outlook or Mail ready to review and send"}>
              <span>
                <Button size="md" disabled={!!blockedBy || busy} onClick={() => doHandoff("eml")}>
                  <Download className="h-4 w-4" /> .eml draft
                </Button>
              </span>
            </Tip>
            {reply && !reply.replied_at && (
              <Button size="md" variant="dark" disabled={busy || !editable} onClick={() => markReplied(t.thread_key)}>
                <MailCheck className="h-4 w-4" /> Mark replied
              </Button>
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
            <Tip content="The tool never sends (draft_only = true). Copy or download the reviewed reply and send it from your own mail app.">
              <span className="ml-auto">
                <button disabled className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-line px-3.5 text-sm font-medium text-muted">
                  <Lock className="h-3.5 w-3.5" /> Send
                </button>
              </span>
            </Tip>
          </div>
          <p className="mt-2 text-xs text-muted">
            {reply?.replied_at
              ? "Replied by a person from their own mail app. The tool sent nothing."
              : reply
                ? `Handed off (${reply.how === "eml" ? ".eml draft" : "copied"}). Mark it replied once it is sent.`
                : !lint.ok
                  ? "Accept a suggestion or fix the flagged claims to save."
                  : dirty
                    ? "Lint clean: save to continue."
                    : (blockedBy ?? "Ready: copy it or download the .eml draft to send from your mail app.")}
          </p>
        </div>
      )}
    </div>
  );
});
