import type { Purpose, Urgency } from "./types.js";

// Table-driven purpose rules, checked in order; the first match wins.
// Run on the fresh (non-quoted) part of the body only. Injection is decided separately in injection.ts.

// "not resolved yet", "the fix is not done yet", "drafted but not approved yet": progress, never a resolution.
const NOT_DONE =
  /\b(not|isn't|isnt|hasn't|hasnt|haven't|havent|yet to be)\s+(yet\s+)?(been\s+)?(resolved|fixed|done|complete|completed|closed|sorted|approved|finished|signed off)\b|\b(resolved|fixed|done|complete|completed|closed|approved)\b[^.;]*\byet\b/i;
// Work that cannot continue: "can't ship until…", "on hold pending…", "waiting on X before we can…".
const BLOCKED =
  /\b(is|are)\s+blocked\b|\bblocked (by|on)\b|\bblocker\b|\bcannot proceed\b|\b(stuck|held up|on hold|paused|stalled)\b|\b(can't|cannot|can not|unable to|won't be able to)\b[^.;]*\b(until|because|since|pending|without|while)\b|\b(can't|cannot|can not|unable to)\s+(go live|proceed|move( forward| ahead)?|continue|start|launch|publish|ship|process|file|issue|update)\b|\bnothing can (move|proceed|happen|go|be)\b|\bwaiting (on|for)\b[^.;]*\bbefore (we|i) can\b|\b(server|portal|gateway|system|api|site|service)\s+(is|are)\s+down\b/i;
// A fix that is only a condition ("can't ship until the API is restored") is not a resolution.
const STILL_WAITING =
  /\b(can't|cannot|can not|unable to|won't be able to)\b[^.;]*\b(until|because|since|pending|without)\b|\buntil\b[^.;]*\b(is|are|has been|have been)\s+(restored|fixed|resolved|back)\b/i;
const QUESTION_END = /\?\s*$/;

export const PURPOSE_RULES: { purpose: Purpose; pattern: RegExp; why: string; unless?: RegExp }[] = [
  {
    purpose: "correction",
    pattern:
      /^\s*((small|quick|minor)\s+)?(correction|amendment|fix to what i (sent|said|shared))\b|^\s*update\s*(to my (last|earlier|previous) (mail|email|message))?\s*[:-]|\b(revised|corrected|updated|new) (due date|deadline|date|cutoff|owner|amount|figure)\b|\b(deadline|due date|cutoff|date|handover|meeting|review)\s+(has\s+)?(moved|changed|shifted|been pushed|is now|moves)\b|\binstead of\b|\bcorrecting (myself|my)\b|\b(gave|sent|shared|used|quoted) the wrong\b|\b(sorry|apologies)\b[^.]*\bwrong\b|\bwrong (date|amount|figure|number|store|owner|invoice|deadline|time)\b|\b(date|deadline|amount|figure|number|owner) i (mentioned|gave|sent|shared|quoted) (was|is) (wrong|incorrect|off)\b|\b(made|there was) a mistake\b|\bignore the (date|deadline|time|number|amount)\b[^.]*\b(previous|earlier|last)\b|\bdisregard (the|my) (amount|date|figure|number|deadline|owner)\b|\b(the )?(right|correct) (figure|date|amount|number|owner) is\b|\bit should (be|have been)\b|\bchange of plan\b|\bplease note the change\b|,\s*not\s+(the\s+)?[\w.%-]+(\s+[\w.%-]+)?\s*[.!]?\s*$/i,
    unless: QUESTION_END,
    why: "corrects something said earlier",
  },
  {
    purpose: "duplicate",
    pattern:
      /\bsame\b[^.?!]*\b(request|issue|ticket|email|message|problem|question)\b[^.?!]*\b(above|earlier|before|again|yesterday|previous|last|reported|raised|asked)\b|\bsame (problem|issue|question|request) (as|i|we)\b|\bsame as (my|the|our) (previous|earlier|last)\b|\bduplicate of\b|\bre-?sending\b|\bre-?rais(e|ing)\b|\bbumping (this|it)\b|\bfollowing up (again|once more|on (the same|my (earlier|previous|last)))\b|\b(forwarding|sending) (this|it) (again|once more)\b|\b(once more|one more time)\b|\brepeating (my|the|our) (earlier |previous |last )?(request|email|question|mail|message)\b|\b(second|third|final|another) (reminder|follow[- ]?up|nudge)\b|\bstill waiting (on|for) (a |your )?(reply|response|answer|update)\b|\bhaven'?t heard back\b|\bno (reply|response) yet\b|\bchasing (this|again|once|up)\b/i,
    why: "repeats an earlier request",
  },
  {
    purpose: "resolution",
    pattern:
      /\b(is|are|has been|have been|now)\s+(resolved|fixed|complete|completed|closed|done|recovered|restored|live|reversed|processed|updated|refunded)\b|\bdo not chase\b|\bno longer (needed|blocked|occurs|happens|an issue|a problem)\b|\b(all\s+)?sorted( now| out)?\b|\bfixed (in production|now|as of)\b|\bclosing (this|it)( one| out| now)?\b|^\s*(done|resolved)\b|\b(we|i|they|the team) (have )?(completed|fixed|resolved|closed|finished|recovered|restored|reversed|shipped)\b|\bcompleted successfully\b|\b(is|are) back (up|online|to normal)\b|\bnothing (pending|further needed)\b|\b(issue|ticket|item|request|incident) (is )?closed\b|\b(went|gone) (through|live)\b|\ball good( now)?\b/i,
    unless: new RegExp(`${NOT_DONE.source}|${STILL_WAITING.source}|${QUESTION_END.source}`, "i"),
    why: "says the item is resolved or complete",
  },
  {
    purpose: "status_update",
    pattern:
      /\b(almost|nearly|mostly)\s+(done|complete|finished)\b|\bin progress\b|\bstill (needs|working|pending|investigating|testing|going on|in progress|being)\b|\bworking (on|through)\b|\bhalf ?way\b|\bpart ?way\b|\bpartial(ly)?\b|\bongoing\b|\b\d{1,3}\s?% (done|complete|completed|through)\b|\b(one|two)-thirds?\b|\b\d+ of \d+\b|\b(making|made) (good |some )?progress\b|\bprogress update\b|\bunder ?way\b|^\s*(quick\s+)?status\s*[:-]|\btesting (continues|is still)\b|\bwill need another (day|week|hour)\b|\b(have |we've )?started (on|work on|the)\b|\bexpect (to finish|it|completion)\b|\bin review\b|\bbeing (pulled|worked on|prepared|processed|reviewed|tested)\b|\b(two|three|four|five|\d+) \w+ (left|remaining)\b/i,
    unless: QUESTION_END,
    why: "reports progress, not completion",
  },
  {
    purpose: "status_update",
    pattern: NOT_DONE,
    why: "says the item is not done yet",
  },
  {
    purpose: "blocker",
    pattern: BLOCKED,
    unless: QUESTION_END,
    why: "reports a blocker",
  },
  {
    purpose: "fyi",
    pattern:
      /\balready (tracks?|tracked|logged|raised|covers?|covered|being handled|handled)\b|\bfyi\b|\bfor (your )?(information|records|reference|awareness)\b|\bno action (needed|required)\b|\bheads[- ]up\b|\blooping (you|in)\b|\bfor visibility\b|\bjust (letting you know|so you know|sharing)\b|^\s*please note\b|^\s*note that\b|\bbeing handled under\b/i,
    why: "informational; nothing requested",
  },
  {
    purpose: "commitment",
    pattern:
      /^\s*(i|we)('ll|\s+will|\s+shall)\b|^\s*(noted|sure|ok(ay)?)[,.]?\s+(i|we)('ll|\s+will)\b|^\s*will (do|get back|send|share|review|update|check|revert|confirm|circle back)\b|\blet me (check|confirm|look|get back|revert)\b|\b(i'?m|i am|we'?re|we are) (going to|on it)\b|\bleave it with me\b|^\s*(i|we) can (take|handle|pick|do|send|share|look)\b|\b(i|we)('ll|\s+will) (report back|get back|revert|circle back)\b/i,
    why: "sender commits to doing something",
  },
  {
    purpose: "question",
    // A question that needs an answer from us. "Could you look into why…?" is a request, so only
    // clarify/confirm, a wh-word that opens a sentence, or a yes/no question count here.
    pattern:
      /\b(clarify|confirm)\b[^?]*\?|(^|[.!]\s+)(which|what|when|where|who|whom|whose|why|how)\b[^?]*\?|^\s*(is|are|was|were|do|does|did|should|shall|has|have|had|am)\b[^?]*\?|\bany idea\b[^?]*\?|\bdo (you|we) know\b[^?]*\?|\bwondering (if|whether|who|what|when|how)\b/i,
    why: "asks a question that needs an answer",
  },
  {
    purpose: "request",
    pattern:
      /\b(please|kindly)\b|\b(we|you) need\b|^\s*need (the|a|an|someone|somebody|you|this)\b|\bneed (someone|somebody|you) to\b|\bneeds? to be\b|\b(can|could|would) (you|someone|somebody|anyone)\b|\brequest(ing)? (access|approval|a|an|the)\b|\bmake sure\b|\bensure\b|^\s*(assign|send|share|raise|update|fix|check|verify|process|issue|prepare|review|approve|reconcile|refund|reissue|schedule|set up|add|create|investigate|look into)\b/i,
    why: "asks for work to be done",
  },
  {
    purpose: "question",
    pattern: QUESTION_END,
    why: "ends with a question that needs an answer",
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

/** Urgency wording on mail that asks nothing of us is spoofed urgency: it is shown, but never raises the rank. */
export const SPOOFED_URGENCY = "urgency wording ignored: nothing is asked of us";

export function classifyUrgency(i: UrgencyInput): { urgency: Urgency; why: string } {
  const urgentWords = URGENT_WORDS.test(i.text);
  switch (i.purpose) {
    case "injection":
      return { urgency: "n/a", why: "quarantined; urgency wording is not trusted" };
    case "resolution":
    case "fyi":
    case "status_update":
    case "commitment":
      return { urgency: "low", why: urgentWords ? SPOOFED_URGENCY : "nothing is asked of us" };
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
