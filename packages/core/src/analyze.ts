import type { AiOpinion, AiPrediction, Purpose, RawEmail } from "./types.js";
import { splitQuoted } from "./normalize.js";
import { classifyPurpose, isFallback } from "./classify.js";
import { detectInjection, type InjectionResult } from "./injection.js";
import { extractDates, type DateMention } from "./extract/dates.js";
import { extractOwner, type OwnerMention } from "./extract/owners.js";
import { extractReferences, extractAnaphora, ALREADY_TRACKED, type Anaphora } from "./extract/references.js";
import { extractStatus, extractTask, extractClarify, type StatusSignals } from "./extract/status.js";

/** Everything the rules know about one email before it is placed in a thread. */
export interface AnalyzedEmail {
  email: RawEmail;
  fresh: string;
  quoted: string;
  injection: InjectionResult;
  purpose: Purpose;
  purpose_why: string;
  ai?: AiOpinion;
  review: { needed: boolean; reason: string };
  dates: DateMention[];
  owner: OwnerMention | null;
  references: string[];
  already_tracked: string | null;
  anaphora: Anaphora;
  status: StatusSignals;
  task: string | null;
  clarify: string[];
}

export const AI_OVERRIDE_CONFIDENCE = 0.8; // AI may overrule a matching rule only above this
export const AI_LOW_CONFIDENCE = 0.6; // below this an AI-only label goes to review
const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Decide the email type. Rules first; the optional model fills gaps and is checked against them.
 * - rule-detected injection always wins (safety); a model that sees injection also quarantines
 * - no rule matched: the model decides (review if it is unsure); without a model, review
 * - rule and model disagree: flagged for review; the model wins only when very confident
 */
function decidePurpose(fresh: string, injection: InjectionResult, ai?: AiPrediction) {
  const none = { needed: false, reason: "" };
  if (injection.flagged) {
    const why = injection.findings.map((f) => f.why).join("; ");
    return { purpose: "injection" as Purpose, why, review: none, ai: ai && { ...ai, rule_purpose: "injection" as Purpose, decided_by: ai.purpose === "injection" ? ("both" as const) : ("rules" as const) } };
  }
  const rule = classifyPurpose(fresh);
  const fallback = isFallback(rule.why);
  if (!ai) return { purpose: rule.purpose, why: rule.why, review: fallback ? { needed: true, reason: "no rule matched; check the type" } : none };

  const opinion = (decided_by: AiOpinion["decided_by"]): AiOpinion => ({ ...ai, rule_purpose: fallback ? null : rule.purpose, decided_by });
  if (ai.purpose === "injection" && ai.confidence >= 0.5)
    return { purpose: "injection" as Purpose, why: `AI flagged instruction-like content: ${ai.reason}`, review: { needed: true, reason: "AI flagged a possible injection the rules did not catch" }, ai: opinion("ai") };
  if (fallback)
    return {
      purpose: ai.purpose,
      why: `AI (${pct(ai.confidence)}): ${ai.reason}`,
      review: ai.confidence < AI_LOW_CONFIDENCE ? { needed: true, reason: `no rule matched and the AI is unsure (${pct(ai.confidence)})` } : none,
      ai: opinion("ai"),
    };
  if (ai.purpose === rule.purpose) return { purpose: rule.purpose, why: rule.why, review: none, ai: opinion("both") };
  const aiWins = ai.confidence >= AI_OVERRIDE_CONFIDENCE;
  return {
    purpose: aiWins ? ai.purpose : rule.purpose,
    why: aiWins ? `AI (${pct(ai.confidence)}): ${ai.reason}` : rule.why,
    review: { needed: true, reason: `rules said ${rule.purpose.replace("_", " ")}, AI said ${ai.purpose.replace("_", " ")} (${pct(ai.confidence)})` },
    ai: opinion(aiWins ? "ai" : "rules"),
  };
}

export function analyzeEmail(email: RawEmail, ai?: AiPrediction): AnalyzedEmail {
  const { fresh, quoted } = splitQuoted(email.body);
  const injection = detectInjection(email.body); // whole body: quoted instructions are still hostile
  const d = decidePurpose(fresh, injection, ai);
  const review = email.received_at === null && !d.review.needed ? { needed: true, reason: "received time unknown" } : d.review;
  return {
    email,
    fresh,
    quoted,
    injection,
    purpose: d.purpose,
    purpose_why: d.why,
    ai: d.ai,
    review,
    dates: extractDates(fresh, email.received_at),
    owner: extractOwner(fresh),
    references: extractReferences(fresh),
    already_tracked: ALREADY_TRACKED.exec(fresh)?.[0] ?? null,
    anaphora: extractAnaphora(fresh),
    status: extractStatus(fresh),
    task: extractTask(fresh, d.purpose),
    clarify: d.purpose === "question" ? extractClarify(fresh) : [],
  };
}
