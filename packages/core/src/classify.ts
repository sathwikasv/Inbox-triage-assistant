import type { Purpose, Urgency } from "./types.js";

// Table-driven purpose rules, checked in order; the first match wins.
// Run on the fresh (non-quoted) part of the body only. Injection is decided separately in injection.ts.
// "not resolved yet", "the fix is not done yet": progress, never a resolution.
const NOT_DONE = /\b(not|isn't|isnt|hasn't|hasnt|haven't|havent|yet to be)\s+(yet\s+)?(been\s+)?(resolved|fixed|done|complete|completed|closed|sorted)\b|\b(resolved|fixed|done|complete|completed|closed)\b[^.;]*\byet\b/i;

export const PURPOSE_RULES: { purpose: Purpose; pattern: RegExp; why: string; unless?: RegExp }[] = [
  {
    purpose: "correction",
    pattern:
      /^\s*((small|quick|minor)\s+)?(correction|amendment)\b|^\s*update\s*[:-]\s*(the\s+)?(deadline|due|cutoff|date|owner)\b|\b(revised|corrected|updated|new) (due date|deadline|date|cutoff|owner)\b|\b(deadline|due date|cutoff|date)\s+(has\s+)?(moved|changed|shifted|been pushed|is now)\b|\binstead of\b|\bcorrecting (myself|my)\b|\b(gave|sent|shared) the wrong\b|\bignore the (date|deadline|time|number)\b[^.]*\b(previous|earlier|last)\b|\bplease note the change\b/i,
    why: "corrects something said earlier",
  },
  {
    purpose: "duplicate",
    pattern:
      /\bsame\b[^.?!]*\b(request|issue|ticket|email|message)\b[^.?!]*\b(above|earlier|before|again|yesterday|previous|last)\b|\bsame as (my|the|our) (previous|earlier|last)\b|\bduplicate of\b|\bre-?sending\b|\bbumping (this|it)\b|\bfollowing up on (the same|my (earlier|previous|last))\b|\b(forwarding|sending) (this|it) again\b|\brepeating my (request|email|question|mail)\b/i,
    why: "repeats an earlier request",
  },
  {
    purpose: "resolution",
    pattern:
      /\b(is|are|has been|have been|now)\s+(resolved|fixed|complete|completed|closed|done|recovered|restored|live)\b|\bdo not chase\b|\bno longer (needed|blocked)\b|\b(all\s+)?sorted( now| out)?\b|\bfixed (in production|now|as of)\b|\bclosing (this|it) (out|now)\b|^\s*done\b|\b(we|i) have (completed|fixed|resolved|closed|finished|recovered)\b|\bnothing pending\b|\b(issue|ticket|item|request|incident) (is )?closed\b|\bwent through\b/i,
    unless: NOT_DONE,
    why: "says the item is resolved or complete",
  },
  {
    purpose: "status_update",
    pattern:
      /\b(almost|nearly|mostly)\s+(done|complete|finished)\b|\bin progress\b|\bstill (needs|working|pending|investigating|testing)\b|\bworking on\b|\bhalf ?way\b|\b\d{1,3}\s?% (done|complete)\b|\b(making|made) (good |some )?progress\b|\bunder ?way\b|^\s*(quick\s+)?status\s*[:-]|\btesting continues\b|\bwill need another (day|week|hour)\b/i,
    why: "reports progress, not completion",
  },
  {
    purpose: "status_update",
    pattern: NOT_DONE,
    why: "says the item is not done yet",
  },
  {
    purpose: "blocker",
    pattern:
      /\b(is|are)\s+blocked\b|\bblocked (by|on)\b|\bblocker\b|\bcannot proceed\b|\b(stuck|held up|on hold)\b|\b(can't|cannot|can not|unable to)\s+(go live|proceed|move( forward| ahead)?|continue|start|launch)\b|\bnothing can (move|proceed|happen|go)\b/i,
    why: "reports a blocker",
  },
  {
    purpose: "fyi",
    pattern:
      /\balready (tracks?|tracked|logged|raised|covers?|covered)\b|\bfyi\b|\bfor your (information|records|reference|awareness)\b|\bno action (needed|required)\b|\bheads[- ]up\b|\blooping (you|in)\b|\bfor visibility\b|\bjust (letting you know|so you know|sharing)\b/i,
    why: "informational; nothing requested",
  },
  {
    purpose: "commitment",
    pattern:
      /^\s*(i|we)('ll|\s+will|\s+shall)\b|^\s*will (get back|send|share|review|update|check|revert|confirm|circle back)\b|\blet me (check|confirm|look|get back|revert)\b|\b(i'?m|i am|we'?re|we are) going to\b|\bleave it with me\b/i,
    why: "sender commits to doing something",
  },
  {
    purpose: "question",
    // A question that needs an answer from us. "Could you look into why…?" is a request, so only
    // clarify/confirm, a wh-word that opens a sentence, or a yes/no question count.
    pattern:
      /\b(clarify|confirm)\b[^?]*\?|(^|[.!]\s+)(which|what|when|where|who|whom|whose|why|how)\b[^?]*\?|^\s*(is|are|was|were|do|does|did|should|shall|has|have|had|am)\b[^?]*\?/i,
    why: "asks a question that needs an answer",
  },
  {
    purpose: "request",
    pattern:
      /\b(please|kindly)\b|\b(we|you) need\b|\bneed (someone|somebody|you) to\b|\bneeds? to be\b|\b(can|could|would) (you|someone|somebody|anyone)\b|\brequest(ing)? (access|approval|a|an|the)\b|\bmake sure\b|\bensure\b/i,
    why: "asks for work to be done",
  },
];

export function classifyPurpose(text: string): { purpose: Purpose; why: string } {
  for (const r of PURPOSE_RULES) if (r.pattern.test(text) && !r.unless?.test(text)) return { purpose: r.purpose, why: r.why };
  return { purpose: "fyi", why: "no rule matched; treated as informational and left for review" };
}

/** True when no rule matched: the caller should send the email to human review rather than trust the label. */
export function isFallback(why: string): boolean {
  return why.startsWith("no rule matched");
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
