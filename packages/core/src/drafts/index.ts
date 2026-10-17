import type { Decision, Draft, ThreadFacts } from "../types.js";
import { templateDraft } from "./templates.js";
import { lintDraft } from "./lint.js";

export { lintDraft, allowedDates, LINT_RULES } from "./lint.js";
export { templateDraft } from "./templates.js";
export { suggestFixes, type DraftSuggestion } from "./suggest.js";

/** One template draft per thread that needs a reply or acknowledgement, linted against the thread's facts. */
export function buildDrafts(threads: ThreadFacts[], decisions: Decision[]): Draft[] {
  const drafts: Draft[] = [];
  for (const t of threads) {
    const mine = decisions.filter((d) => d.thread_key === t.thread_key);
    const commitment = mine.flatMap((d) => d.facts).find((f) => f.kind === "commitment")?.value.replace(/^sender will /, "");
    const body = templateDraft(t, { commitment, hadBlocker: mine.some((d) => d.purpose === "blocker") });
    if (body === null) continue;
    const lint = lintDraft(body, t);
    drafts.push({ thread_key: t.thread_key, body, source: "template", lint_ok: lint.ok, violations: lint.violations });
  }
  return drafts;
}
