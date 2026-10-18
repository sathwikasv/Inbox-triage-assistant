import type { EventKind, MailMessage } from "./types.js";

// Rule-based detectors for the unified inbox. Each returns its evidence so the UI can say why.

const first = (re: RegExp, text: string) => re.exec(text)?.[0] ?? null;

/** Newsletters and promotions: ordinary marketing, never treated as spam on that basis alone. */
export function detectPromotion(m: Pick<MailMessage, "from" | "subject" | "body" | "list_unsubscribe" | "labels">): string | null {
  if (m.labels?.includes("CATEGORY_PROMOTIONS")) return "Gmail files it under Promotions";
  if (m.list_unsubscribe) return "has a List-Unsubscribe header";
  const unsub = first(/\bunsubscribe\b|\bmanage (your )?(email )?preferences\b|\bview (this email )?in (your )?browser\b/i, m.body);
  if (unsub) return `contains "${unsub}"`;
  if (/^(no-?reply|newsletter|news|marketing|offers|deals|promo|digest|updates)@/i.test(m.from.email)) {
    const promo = first(/\b(\d{1,2}% off|sale|deal|offer|promo code|coupon|limited time|webinar|new arrivals|this week'?s|digest|newsletter)\b/i, `${m.subject} ${m.body}`);
    if (promo) return `bulk sender (${m.from.email}) with "${promo}"`;
  }
  const text = `${m.subject} ${m.body}`;
  const promo = first(
    /\b\d{1,2}% off\b|\bpromo code\b|\buse code [A-Z0-9]{4,}\b|\bshop now\b|\blimited[- ]time offer\b|\b(buy|order|book|register|enrol+|sign up|subscribe|apply|claim|grab|get started|try it)\b[^.\n]{0,25}\b(now|today|free|here|before it)\b|\b(exclusive|special|festive|flash|mega|clearance|early[- ]bird) (offer|deal|sale|discount|access|pricing)\b|\b(free|complimentary) (trial|demo|consultation|ebook|e-book|webinar|course|gift|quote)\b|\b(webinar|masterclass|bootcamp|workshop|summit)\b[^.\n]{0,40}\b(register|join|seats?|sign up)\b|\bdiscount(ed)?\b|\bcashback\b|\bgiveaway\b|\b(last chance|don'?t miss|hurry|ends (today|soon|tonight)|only \d+ (left|seats|spots))\b|\bboost your\b|\bgrow your (business|sales|revenue)\b/i,
    text,
  );
  if (promo) return `promotional wording "${promo}"`;
  // Cold outreach: a stranger selling or recruiting.
  const cold = first(
    /\b(i (came|stumbled) across your (profile|company|website)|we help (companies|businesses|brands|teams)|our (services|solutions|platform|agency|team) (can|will|help)|(schedule|book|hop on) a (quick |short |15[- ]minute )?(call|demo)[^.\n]{0,40}(to show|to discuss|to explore)|reaching out (to|because)|dear (sir|madam|customer|user|valued)|congratulations[,!]? you|you('ve| have) been (selected|chosen)|job opportunity|hiring now|work from home)\b/i,
    text,
  );
  if (cold) return `unsolicited outreach ("${cold}")`;
  // Bulk-style sender addresses with marketing language.
  if (/^(hello|hi|team|info|contact|sales|care|offers?|deals?|rewards?|events?|community|learn|academy|jobs|careers)@/i.test(m.from.email) && /\b(learn more|read more|discover|view (details|offer|plans)|upgrade|plans? (start|from)|starting (at|from))\b/i.test(text)) return `bulk sender (${m.from.email}) with marketing language`;
  return null;
}

/** Phishing and scams: suspicious, separate from newsletters and from prompt injection. */
export function detectPhishing(m: Pick<MailMessage, "from" | "subject" | "body">): string[] {
  const text = `${m.subject}\n${m.body}`;
  const reasons: string[] = [];
  if (/\b(verify|confirm|validate|re-?activate|update)\b[^.]{0,40}\b(your )?(account|password|login|identity|credentials)\b/i.test(text)) reasons.push("asks you to verify an account or password");
  if (/\b(account|mailbox|access)\b[^.]{0,30}\b(will be |has been )?(suspended|locked|disabled|terminated|deactivated)\b/i.test(text)) reasons.push("threatens to lock the account");
  if (/\b(gift ?cards?|crypto|bitcoin|wire (the )?(money|funds|payment))\b/i.test(text)) reasons.push("asks for gift cards, crypto or a wire transfer");
  if (/\b(new|updated|changed) (bank|account) (details|number)\b|\bchange (of|in) (bank|payment) details\b/i.test(text)) reasons.push("asks to pay a changed bank account");
  if (/\b(you('ve| have) won|lottery|prize|claim your (reward|refund|prize))\b/i.test(text)) reasons.push("prize or refund bait");
  if (/https?:\/\/\d{1,3}(\.\d{1,3}){3}/.test(text)) reasons.push("links to a bare IP address");
  if (/https?:\/\/[^\s/]*(paypa1|micros0ft|g00gle|amaz0n|app1e|0utlook|secure-?login|verify-?account)[^\s/]*/i.test(text)) reasons.push("links to a look-alike domain");
  const display = (m.from.name ?? "").toLowerCase();
  const domain = m.from.email.split("@")[1]?.toLowerCase() ?? "";
  for (const brand of ["paypal", "microsoft", "google", "amazon", "apple", "hdfc", "icici", "sbi"]) {
    if (display.includes(brand) && !domain.includes(brand)) reasons.push(`claims to be ${brand} but writes from ${domain}`);
  }
  return reasons;
}

/** What kind of calendar request an email is, if any. */
export function detectScheduling(subject: string, text: string, hasIcs: boolean): { kind: EventKind; quote: string } | null {
  const all = `${subject}\n${text}`;
  const pick = (kind: EventKind, re: RegExp) => {
    const q = first(re, all);
    return q ? { kind, quote: q } : null;
  };
  return (
    pick("cancellation", /\bcancel(l?ed|ling|s)?\b[^.\n]{0,40}\b(meeting|call|session|appointment|sync|demo|interview|review)\b|\b(meeting|call|session|appointment|sync|demo)\b[^.\n]{0,30}\b(is |has been )?cancel(l?ed)\b/i) ??
    pick("reschedule", /\b(reschedule|move|push|postpone|shift|bring forward)\b[^.\n]{0,40}\b(meeting|call|session|appointment|sync|demo|review)\b|\b(meeting|call|session|appointment)\b[^.\n]{0,30}\b(moved|rescheduled|postponed)\b/i) ??
    (hasIcs || /^\s*(invitation|invite|updated invitation)\s*:/i.test(subject) || /\b(you are|you're) invited\b|\bhas invited you\b/i.test(all)
      ? { kind: "invitation" as const, quote: first(/\b(you are|you're) invited[^.\n]*|has invited you[^.\n]*/i, all) ?? subject }
      : null) ??
    pick("confirmation", /\b(confirmed|confirming|booked)\b[^.\n]{0,40}\b(meeting|call|appointment|booking|slot|demo|session)\b|\b(meeting|call|appointment)\b[^.\n]{0,20}\bis confirmed\b|\bsee you (on|at|tomorrow)\b/i) ??
    pick("meeting_request", /\b(schedule|set up|book|arrange|organi[sz]e)\b[^.\n?]{0,40}\b(meeting|call|sync|chat|demo|catch[- ]?up|session|review)\b|\bcan we (meet|talk|connect|hop on|have a (quick )?(call|chat))\b|\bare you (free|available)\b|\blet'?s (meet|connect|catch up|talk|have a call)\b|\b(quick|short) (call|sync|chat)\b/i)
  );
}

export function detectMeetingLink(text: string): string | null {
  return first(/https?:\/\/(?:[\w-]+\.)?(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com)\/[^\s)>"]+/i, text);
}

export function detectLocation(text: string): string | null {
  const labelled = /\b(?:location|venue|where|place)\s*:\s*([^\n]+?)(?:\.\s|\n|$)/i.exec(text);
  if (labelled) return labelled[1].trim();
  const room = /\b(?:in|at) (the )?((?:[A-Z][\w-]*\s){0,3}(?:room|office|hall|cafe|cafeteria|floor|boardroom|conference room|meeting room)\b(?:\s\d+)?)/.exec(text);
  return room ? room[2].trim() : null;
}

export function detectDuration(text: string): number | null {
  const m = /\b(\d{1,3})\s*(?:min|mins|minutes)\b/i.exec(text);
  if (m) return Number(m[1]);
  const h = /\b(\d(?:\.\d)?)\s*(?:h|hr|hrs|hours?)\b/i.exec(text);
  if (h) return Math.round(Number(h[1]) * 60);
  if (/\bhalf an hour\b/i.test(text)) return 30;
  if (/\ban hour\b/i.test(text)) return 60;
  return null;
}

/** Deadlines that cannot be dated without asking: "end of day", "ASAP", "early next week". */
export function detectVagueDeadline(text: string): string | null {
  return first(/\b(by )?(end of (the )?(day|week|month)|eod|eow|cob|close of business|asap|as soon as possible|soon|later this week|early next week|sometime next week)\b/i, text);
}

const NO_REPLY = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|notifications?|notify|alerts?|mailer[-_.]?daemon|postmaster|bounces?|automated|auto[-_.]?(confirm|reply|mailer)|system|messages?[-_.]noreply)([-_.+][^@]*)?@/i;
const AUTOMATED_TEXT = /\b(this is an automated (message|e-?mail|notification)|this (e-?mail|message|notification) was (sent|generated) automatically|(please )?do not reply( directly)? to this (e-?mail|message)|this mailbox is not monitored|replies to this (e-?mail|message) (are|will) not)\b/i;
const SECURITY = /\b(security (alert|notification|notice|checkup)|new sign-?in|signed in|sign-?in (attempt|alert)|new device|password (was )?(changed|reset)|2-step|two-factor|verification code|one-time (code|password)|suspicious (activity|sign)|unusual activity|account (data|access|recovery)|shared some .{0,40}data|data breach|login (alert|attempt))\b/i;

/** A sender with nobody to answer: a no-reply address, a system notice or a Gmail "Updates/Social/Forums" mail. */
export function isNoReply(email: string) {
  return NO_REPLY.test(email);
}

/** Automated mail (notifications, account and security notices). Requests in it are not work for the reader. */
export function detectAutomated(m: Pick<MailMessage, "from" | "subject" | "body" | "labels">): { kind: "security" | "notification"; why: string } | null {
  const domain = m.from.email.split("@")[1] ?? "";
  const labels = m.labels ?? [];
  const why = NO_REPLY.test(m.from.email)
    ? `sent from a no-reply address at ${domain}`
    : labels.includes("CATEGORY_UPDATES")
      ? "Gmail files it under Updates"
      : labels.includes("CATEGORY_SOCIAL")
        ? "Gmail files it under Social"
        : labels.includes("CATEGORY_FORUMS")
          ? "Gmail files it under Forums"
          : AUTOMATED_TEXT.test(m.body)
            ? `the email says it was sent automatically`
            : null;
  if (!why) return null;
  return { kind: SECURITY.test(`${m.subject}\n${m.body.slice(0, 1500)}`) ? "security" : "notification", why };
}
