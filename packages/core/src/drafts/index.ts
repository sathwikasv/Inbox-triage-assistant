import type { Decision, Draft, DraftTone, ThreadFacts } from "../types.js";
import { draftInTone, TONES } from "./templates.js";
import { lintDraft } from "./lint.js";

export { lintDraft, allowedDates, LINT_RULES } from "./lint.js";
export { templateDraft, draftInTone, TONES } from "./templates.js";
export { suggestFixes, type DraftSuggestion } from "./suggest.js";
export { needsApproval, correctionBurden } from "./review.js";

/** The email a reply answers: the newest one in the thread that asks something, else the newest. */
function replyTarget(ds: Decision[]): Decision | undefined {
  const asks = ["request", "correction", "question", "blocker", "commitment", "resolution"];
  return [...ds].reverse().find((d) => asks.includes(d.purpose)) ?? ds.at(-1);
}

/** One template draft per thread that needs a reply or acknowledgement, in every tone, linted against the thread facts. */
export function buildDrafts(threads: ThreadFacts[], decisions: Decision[]): Draft[] {
  const drafts: Draft[] = [];
  for (const t of threads) {
    const mine = decisions.filter((d) => d.thread_key === t.thread_key);
    const ctx = { commitment: mine.flatMap((d) => d.facts).find((f) => f.kind === "commitment")?.value.replace(/^sender will /, ""), hadBlocker: mine.some((d) => d.purpose === "blocker") };
    const body = draftInTone(t, ctx, "standard");
    if (body === null) continue;
    const lint = lintDraft(body, t);
    const tones: Partial<Record<DraftTone, string>> = {};
    for (const { id } of TONES) {
      const v = draftInTone(t, ctx, id);
      if (v && lintDraft(v, t).ok) tones[id] = v;
    }
    const target = replyTarget(mine.filter((d) => t.email_ids.includes(d.email_id)));
    drafts.push({
      thread_key: t.thread_key,
      body,
      source: "template",
      lint_ok: lint.ok,
      violations: lint.violations,
      tones,
      reply_to: target ? { email_id: target.email_id, subject: target.subject } : null,
    });
  }
  return drafts;
}
