import { sentences } from "../normalize.js";

export interface StatusSignals {
  resolved: string | null; // evidence quote
  in_progress: string | null;
  blocked: string | null;
  no_chase: string | null; // explicit "do not chase"
  attachment_claim: string | null; // "the file is now attached" — a claim, never verified
  constraint: string | null; // "Keep one ticket only"
}

function find(text: string, re: RegExp): string | null {
  for (const s of sentences(text)) if (re.test(s.text)) return s.text;
  return null;
}

export function extractStatus(text: string): StatusSignals {
  const progress = /\b(almost|nearly|mostly)\s+(done|complete|finished)\b|\bin progress\b|\bstill (needs|working|pending)\b/i;
  return {
    resolved: progress.test(text) ? null : find(text, /\b(resolved|fixed|completed?|closed|done)\b|\bno longer (needed|blocked)\b/i),
    in_progress: find(text, progress),
    blocked: /\b(resolved|fixed|no longer)\b/i.test(text) ? null : find(text, /\bblocked\b|\bblocker\b|\bcannot proceed\b/i),
    no_chase: find(text, /\bdo not chase\b|\bno need to (chase|follow up)\b|\bno follow[- ]?up needed\b/i),
    attachment_claim: find(text, /\b(attached|attachment|enclosed)\b/i),
    constraint: find(text, /\bkeep (only )?one\b|\bonly one\b|\bdo not (open|create) (a )?(new|another)\b/i),
  };
}

/** The work item named by a request, blocker, question or commitment, in plain words. */
export function extractTask(text: string, purpose: string): string | null {
  const first = sentences(text)[0]?.text ?? text;
  const clean = (s: string) => s.replace(/[.;!?]+$/, "").trim();
  if (purpose === "request") {
    const m = /\b(?:please|kindly|we need to|you need to|can you|could you)\s+(.+)/i.exec(first);
    return m ? clean(m[1]) : clean(first);
  }
  if (purpose === "blocker") {
    const m = /(?:the\s+)?(.+?)\s+is blocked (?:by|on)\s+(.+)/i.exec(first);
    return m ? `${clean(m[2])} blocking the ${clean(m[1])}` : clean(first);
  }
  if (purpose === "commitment") {
    const m = /^\s*(?:i|we)(?:'ll|\s+will|\s+shall)\s+(.+)/i.exec(first);
    return m ? clean(m[1]).replace(/\s+(today|tomorrow|tonight)$/i, "") : clean(first);
  }
  return null;
}

/** "Can you clarify which store and time period?" → ["store", "time period"]. */
export function extractClarify(text: string): string[] {
  const m = /\bwhich\s+([^?]+)\?/i.exec(text);
  if (!m) return [];
  return m[1]
    .split(/,|\band\b|\bor\b/)
    .map((s) => s.trim())
    .filter(Boolean);
}
