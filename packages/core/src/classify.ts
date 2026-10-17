import type { Purpose, Urgency } from "./types.js";

// Table-driven purpose rules, checked in order; the first match wins.
// Run on the fresh (non-quoted) part of the body only. Injection is decided separately in injection.ts.
export const PURPOSE_RULES: { purpose: Purpose; pattern: RegExp; why: string }[] = [
  {
    purpose: "correction",
    pattern: /^\s*(correction|amendment|update)\s*[:-]|\b(revised|corrected|updated|new) (due date|deadline)\b|\binstead of\b/i,
    why: "opens with a correction marker",
  },
  {
    purpose: "duplicate",
    pattern: /\bsame\b[^.?!]*\b(request|issue|ticket|email|message)\b[^.?!]*\b(above|earlier|before|again)\b|\bduplicate of\b|\bresending\b/i,
    why: "points back to the same earlier request",
  },
  {
    purpose: "resolution",
    pattern: /\b(is|are|has been|have been|now)\s+(resolved|fixed|complete|completed|closed|done)\b|\bdo not chase\b|\bno longer (needed|blocked)\b/i,
    why: "says the item is resolved or complete",
  },
  {
    purpose: "status_update",
    pattern: /\b(almost|nearly|mostly)\s+(done|complete|finished)\b|\bin progress\b|\bstill (needs|working|pending)\b|\bworking on\b/i,
    why: "reports progress, not completion",
  },
  {
    purpose: "blocker",
    pattern: /\b(is|are)\s+blocked\b|\bblocked (by|on)\b|\bblocker\b|\bcannot proceed\b/i,
    why: "reports a blocker",
  },
  {
    purpose: "fyi",
    pattern: /\balready (tracks?|tracked|logged|raised)\b|\bfyi\b|\bfor your information\b|\bno action (needed|required)\b/i,
    why: "informational; nothing requested",
  },
  {
    purpose: "commitment",
    pattern: /^\s*(i|we)('ll|\s+will|\s+shall)\b/i,
    why: "sender commits to doing something",
  },
  {
    purpose: "question",
    pattern: /\b(clarify|confirm|which|what|when|where|who|why|how)\b[^?]*\?/i,
    why: "asks a question that needs an answer",
  },
  {
    purpose: "request",
    pattern: /\b(please|kindly)\b|\b(we|you) need to\b|\bneeds? to be\b|\b(can|could) you\b/i,
    why: "asks for work to be done",
  },
];

export function classifyPurpose(text: string): { purpose: Purpose; why: string } {
  for (const r of PURPOSE_RULES) if (r.pattern.test(text)) return { purpose: r.purpose, why: r.why };
  return { purpose: "fyi", why: "no rule matched; treated as informational and left for review" };
}

export interface UrgencyInput {
  purpose: Purpose;
  text: string;
  received_at: string | null;
  due?: string | null; // YYYY-MM-DD
  owner_missing?: boolean;
  original_urgency?: Urgency; // for duplicates
}

const URGENT_WORDS = /\b(urgent|asap|immediately|right away|critical)\b/i;
const HIGH_WITHIN_DAYS = 3;

function daysBetween(fromIso: string, toYmd: string): number {
  // received_at carries its own offset; its date part is the local calendar day.
  const from = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const to = Date.UTC(+toYmd.slice(0, 4), +toYmd.slice(5, 7) - 1, +toYmd.slice(8, 10));
  return Math.round((to - from) / 86_400_000);
}

export function classifyUrgency(i: UrgencyInput): { urgency: Urgency; why: string } {
  const urgentWords = URGENT_WORDS.test(i.text);
  switch (i.purpose) {
    case "injection":
      return { urgency: "n/a", why: "quarantined; urgency wording is not trusted" };
    case "resolution":
    case "fyi":
    case "status_update":
    case "commitment":
      return { urgency: "low", why: urgentWords ? "urgency wording ignored: nothing is asked of us" : "nothing is asked of us" };
    case "duplicate": {
      const down: Record<Urgency, Urgency> = { high: "medium", medium: "low", low: "low", "n/a": "low" };
      return { urgency: down[i.original_urgency ?? "high"], why: "repeat of an existing request; counted once" };
    }
    case "question":
      return { urgency: urgentWords ? "high" : "medium", why: "needs an answer before work can continue" };
    case "blocker":
      return { urgency: "high", why: "work is blocked" };
    case "correction":
      return { urgency: "high", why: "changes an open commitment; the owner must see it" };
    case "request": {
      if (i.owner_missing) return { urgency: "high", why: "no confirmed owner; needs escalation" };
      if (i.due && i.received_at) {
        const d = daysBetween(i.received_at, i.due);
        if (d <= HIGH_WITHIN_DAYS) return { urgency: "high", why: `due in ${d} day(s)` };
      }
      if (urgentWords) return { urgency: "high", why: "marked urgent" };
      return { urgency: "medium", why: "request without a near deadline" };
    }
  }
}
