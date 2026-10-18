import { Link } from "react-router-dom";
import { AlertTriangle, Brain, CheckCircle2, Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { MailboxView, MailThread } from "@c16/core";
import { useApp } from "../../store/app";
import { lastMessageId, useAssistant } from "../../store/assistant";
import { useReviewItems } from "../../lib/review";
import { cn } from "../../ui";

const Source = ({ s }: { s: "ai" | "rules" }) => (
  <span className={cn("shrink-0 rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide", s === "ai" ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" : "bg-subtle text-muted")}>{s === "ai" ? "AI" : "Rule"}</span>
);

/** What the assistant made of this conversation, and what still needs a person. */
export function AssistantCard({ view, thread }: { view: MailboxView; thread: MailThread }) {
  const a = useAssistant();
  const name = useApp((s) => s.prefs.name);
  const items = useReviewItems().filter((i) => i.thread_key === thread.key && i.kind !== "assistant" && i.kind !== "quarantine");
  const r = a.results[thread.key];
  const fresh = r && r.for_message === lastMessageId(thread);
  const working = a.working === thread.key;
  const error = a.errors[thread.key];
  const canRun = a.enabled && a.status.available;
  const reasons = [...(fresh ? r.review.reasons : []), ...items.map((i) => ({ text: `${i.title.split(":")[0]}: ${i.detail}`, source: i.source }))];
  if (!fresh && !working && !reasons.length && !canRun && !(a.status.available && !a.enabled)) return null;

  return (
    <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/80 via-surface to-surface p-4 dark:border-violet-500/25 dark:from-violet-500/10">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-600 text-white">
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold">Assistant</span>
        <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted ring-1 ring-inset ring-line">{fresh ? `AI · ${r.model}` : canRun ? "AI" : "rules only"}</span>
        <span className="ml-auto">
          {canRun ? (
            <button
              onClick={() => a.analyze(view, thread, name)}
              disabled={!!a.working}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-surface px-3 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50 dark:border-violet-500/30 dark:text-violet-300"
            >
              {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : fresh ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              {working ? "Reading the conversation…" : fresh ? "Ask again" : "Summarise and draft a reply"}
            </button>
          ) : (
            a.status.available && (
              <Link to="/settings?s=assistant" className="text-xs font-medium text-violet-700 hover:underline dark:text-violet-300">
                Turn on the AI assistant
              </Link>
            )
          )}
        </span>
      </div>

      {fresh && (r.memory_used?.earlier_messages || r.memory_used?.related.length || r.memory_saved) ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-violet-800 dark:text-violet-200">
          <Brain className="h-3.5 w-3.5" />
          {r.memory_used?.earlier_messages ? <span className="rounded-full bg-violet-100 px-2 py-0.5 dark:bg-violet-500/15">remembered {r.memory_used.earlier_messages} earlier message{r.memory_used.earlier_messages === 1 ? "" : "s"}</span> : null}
          {r.memory_used?.related.map((s) => (
            <span key={s} className="rounded-full bg-violet-100 px-2 py-0.5 dark:bg-violet-500/15">
              related: {s}
            </span>
          ))}
          {r.memory_saved && !r.memory_used?.earlier_messages && <span className="text-muted">notes saved for next time</span>}
        </div>
      ) : null}
      {fresh && (
        <div className="mt-3 space-y-2">
          <p className="text-sm leading-relaxed">{r.summary}</p>
          {r.key_points.length > 0 && (
            <ul className="grid gap-1 sm:grid-cols-2">
              {r.key_points.map((k) => (
                <li key={k} className="flex items-start gap-1.5 text-xs">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" /> {k}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {fresh && r.memory && (r.memory.tasks.some((t) => !t.done) || r.memory.open_questions.length > 0) && (
        <div className="mt-3 grid gap-2 rounded-xl bg-surface/70 p-3 text-xs sm:grid-cols-2">
          {r.memory.tasks.some((t) => !t.done) && (
            <div>
              <div className="label-xs mb-1">Open tasks in this conversation</div>
              <ul className="space-y-0.5">
                {r.memory.tasks
                  .filter((t) => !t.done)
                  .map((t) => (
                    <li key={t.text}>
                      • {t.text}
                      {t.owner ? <span className="text-muted"> · {t.owner}</span> : null}
                      {t.due ? <span className="text-muted"> · due {t.due}</span> : null}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {r.memory.open_questions.length > 0 && (
            <div>
              <div className="label-xs mb-1">Still unanswered</div>
              <ul className="space-y-0.5">
                {r.memory.open_questions.map((q) => (
                  <li key={q}>• {q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {working && !fresh && <div className="mt-3 h-12 animate-pulse rounded-xl bg-violet-100/60 dark:bg-violet-500/10" />}
      {error && !working && <p className="mt-3 text-xs text-rose-700 dark:text-rose-300">The assistant could not read this conversation: {error}</p>}

      {reasons.length > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" /> Needs your review
          </div>
          <ul className="space-y-1">
            {reasons.map((x, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-amber-950 dark:text-amber-100">
                <Source s={x.source} /> <span>{x.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        fresh && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> Nothing here needs special review.
          </p>
        )
      )}

      {fresh && (
        <p className="mt-2 text-xs text-muted">
          {r.reply_status === "ok" ? "A reply draft is ready below. Read it and edit it before you send; nothing is sent automatically." : r.reply_status === "rejected" ? "The AI's draft was withheld because it made claims the conversation does not support." : "No reply seems to be needed."}
        </p>
      )}
    </div>
  );
}
