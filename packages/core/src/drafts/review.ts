import type { ThreadFacts } from "../types.js";

/**
 * Permission control before anything leaves the team: a reply that states a date, makes a "we will"
 * commitment, or sits on an escalated thread needs an Approver's sign-off. Web and API share this rule.
 */
export function needsApproval(body: string, t: ThreadFacts): { needed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (/\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)\b/.test(body)) reasons.push("states a date");
  if (/\b(we|i) will\b|\bwe'll\b|\bi'll\b/i.test(body)) reasons.push("makes a commitment");
  if (t.escalations.length) reasons.push("the thread is escalated");
  return { needed: reasons.length > 0, reasons };
}

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}'-]+/gu) ?? [];

/**
 * Draft correction burden (the pilot metric on the card): how much of the suggested draft a person had
 * to change, as word-level edit distance over the longer text. 0 = sent as suggested, 1 = rewritten.
 */
export function correctionBurden(suggested: string, final: string): { changed_words: number; total_words: number; ratio: number } {
  const a = words(suggested);
  const b = words(final);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  const total = Math.max(a.length, b.length);
  const changed = prev[b.length];
  return { changed_words: changed, total_words: total, ratio: total ? Math.round((changed / total) * 1000) / 1000 : 0 };
}
