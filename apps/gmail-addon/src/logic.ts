// Pure decision logic for the Gmail add-on: no Apps Script globals here, so it is unit-tested with vitest.

export const TYPES = [
  "request",
  "correction",
  "resolution",
  "duplicate",
  "status_update",
  "fyi",
  "commitment",
  "question",
  "blocker",
  "injection",
  "promotion",
  "sensitive",
] as const;
export type MailType = (typeof TYPES)[number];

export const TYPE_LABEL: Record<MailType, string> = {
  request: "Request",
  correction: "Correction",
  resolution: "Resolution",
  duplicate: "Duplicate",
  status_update: "Status update",
  fyi: "FYI",
  commitment: "Commitment",
  question: "Question",
  blocker: "Blocker",
  injection: "Injection",
  promotion: "Promotion",
  sensitive: "Sensitive",
};

export type Bucket = "do_now" | "delegate" | "schedule" | "fyi" | "review";
export type Level = "high" | "medium" | "low";

/** Gmail label per bucket. Colours come from Gmail's fixed label palette. */
export const BUCKETS: Record<Bucket, { label: string; emoji: string; title: string; bg: string; fg: string; hint: string }> = {
  do_now: { label: "Triage/1 Do now", emoji: "🔴", title: "Do now", bg: "#fb4c2f", fg: "#ffffff", hint: "urgent and important" },
  delegate: { label: "Triage/2 Delegate", emoji: "🟠", title: "Delegate", bg: "#ffad47", fg: "#000000", hint: "urgent, someone else owns it" },
  schedule: { label: "Triage/3 Schedule", emoji: "🟡", title: "Schedule", bg: "#fad165", fg: "#000000", hint: "important, not urgent" },
  fyi: { label: "Triage/4 FYI", emoji: "🟢", title: "FYI / done", bg: "#16a766", fg: "#ffffff", hint: "no action needed" },
  review: { label: "Triage/0 Human review", emoji: "🟣", title: "Human review", bg: "#a479e2", fg: "#ffffff", hint: "sensitive, unsafe or uncertain" },
};

/* ---------------- Sensitive content ---------------- */

const SENSITIVE: { id: string; re: RegExp; why: string }[] = [
  { id: "credentials", re: /\b(password|passcode|otp|one[- ]time (code|password)|pin code|2fa code|verification code|login code)\b/i, why: "mentions credentials or one-time codes" },
  { id: "card", re: /\b(?:\d[ -]?){13,19}\b|\bcvv\b|\bcard number\b/i, why: "contains a card number or card details" },
  { id: "bank", re: /\b(bank account|account number|ifsc|iban|swift|routing number|upi id|wire transfer)\b/i, why: "involves bank account details" },
  { id: "aadhaar", re: /\b\d{4}\s?\d{4}\s?\d{4}\b|\baadhaar\b/i, why: "contains an Aadhaar-like identity number" },
  { id: "pan", re: /\b[A-Z]{5}\d{4}[A-Z]\b|\bpan card\b/, why: "contains a PAN-like tax id" },
  { id: "hr", re: /\b(salary|payslip|compensation|appraisal|termination|resignation|disciplinary|harassment|grievance|offer letter)\b/i, why: "HR or personnel matter" },
  { id: "legal", re: /\b(legal notice|lawsuit|litigation|subpoena|court|attorney|lawyer|nda breach|non-disclosure)\b/i, why: "legal matter" },
  { id: "medical", re: /\b(medical|diagnosis|prescription|hospital|health report|sick leave)\b/i, why: "health or medical information" },
  { id: "personal", re: /\b(family emergency|personal matter|confidential and personal|bereavement)\b/i, why: "personal matter" },
];

export function detectSensitive(text: string): { sensitive: boolean; reasons: string[] } {
  const reasons = SENSITIVE.filter((s) => s.re.test(text)).map((s) => s.why);
  return { sensitive: reasons.length > 0, reasons };
}

/* ---------------- Sender trust ---------------- */

const FREE_MAIL = /@(gmail|yahoo|outlook|hotmail|live|icloud|proton|protonmail|aol|gmx|yandex|rediffmail)\./i;
const ROLE_NAME = /\b(ceo|cfo|admin|administrator|it team|it support|security|support team|helpdesk|bank|paypal|amazon|microsoft|google|hr|payroll|accounts)\b/i;
const URGENT_WORDS = /\b(urgent|important|asap|immediately|action required|final notice|last chance|act now|verify now)\b/i;
const MONEY_ASK = /\b(gift cards?|wire|transfer (the )?(funds|money)|payment link|pay now|bitcoin|crypto|invoice attached|refund pending|claim your)\b/i;
const CRED_ASK = /\b(verify your (account|password|identity)|confirm your (password|login|details)|reset your password|log ?in here|click (here|the link) to (verify|login|sign in))\b/i;

export interface SenderSignals {
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  authResults?: string | null; // Authentication-Results header
  priorMessages: number; // earlier messages from this sender in the mailbox
  userReplied: number; // threads with this sender where the user replied
  subject: string;
  body: string;
  links: number; // links in the body
  hasAsk: boolean; // the body asks for something concrete (request, question, deadline)
}

export function trustScore(s: SenderSignals): { score: number; reasons: string[]; spoofedUrgency: boolean } {
  let score = 60;
  const reasons: string[] = [];
  const add = (n: number, why: string) => {
    score += n;
    reasons.push(`${n > 0 ? "+" : ""}${n} ${why}`);
  };
  if (s.priorMessages >= 2) add(15, `known sender (${s.priorMessages} earlier emails)`);
  else add(-10, "first-time or rare sender");
  if (s.userReplied > 0) add(10, "you have replied to this sender before");
  const auth = s.authResults ?? "";
  if (/\b(spf|dkim|dmarc)=fail\b/i.test(auth)) add(-35, "failed SPF/DKIM/DMARC");
  else if (/\bdkim=pass\b/i.test(auth) && /\bspf=pass\b/i.test(auth)) add(10, "SPF and DKIM pass");
  if (ROLE_NAME.test(s.fromName) && FREE_MAIL.test(s.fromEmail)) add(-25, `"${s.fromName}" writes from a free mail address`);
  const domain = (e: string) => e.split("@")[1]?.toLowerCase() ?? "";
  if (s.replyTo && domain(s.replyTo) && domain(s.replyTo) !== domain(s.fromEmail)) add(-15, "Reply-To goes to a different domain");
  const text = `${s.subject}\n${s.body}`;
  if (CRED_ASK.test(text)) add(-30, "asks you to verify or enter credentials");
  if (MONEY_ASK.test(text)) add(-25, "asks for money, gift cards or payment");
  if (s.links >= 4) add(-5, `${s.links} links`);
  const spoofedUrgency = URGENT_WORDS.test(s.subject) && !s.hasAsk;
  if (spoofedUrgency) add(-10, "urgent wording in the subject but no real ask or deadline in the body");
  return { score: Math.max(0, Math.min(100, score)), reasons, spoofedUrgency };
}

/* ---------------- Priority bucket ---------------- */

export interface BucketInput {
  type: MailType;
  urgency: Level; // from rules + AI, after ignoring subject-only urgency words
  importance: Level;
  actionNeeded: boolean;
  owner?: string | null; // owner named in the email (null = explicitly unowned)
  me?: string; // the mailbox owner's name or address, to tell "mine" from "theirs"
  dueInDays?: number | null;
  sensitive: boolean;
  trust: number;
  confidence: number; // 0..1, agreement-weighted
  reviewFlag?: string | null; // a reason from the rules engine to involve a person
}

export function decideBucket(i: BucketInput): { bucket: Bucket; reason: string } {
  if (i.type === "injection") return { bucket: "review", reason: "instructions aimed at an assistant; quarantined for a person" };
  if (i.sensitive || i.type === "sensitive") return { bucket: "review", reason: "sensitive, security or personal content; a person should handle it" };
  if (i.trust < 35) return { bucket: "review", reason: `low sender trust (${i.trust}/100); possible phishing` };
  if (i.confidence < 0.55) return { bucket: "review", reason: `uncertain classification (${Math.round(i.confidence * 100)}%)` };
  if (i.reviewFlag) return { bucket: "review", reason: i.reviewFlag };
  if (i.type === "promotion") return { bucket: "fyi", reason: "promotion or newsletter" };
  if (!i.actionNeeded || ["fyi", "resolution", "status_update", "duplicate"].includes(i.type)) {
    return i.type === "commitment" ? { bucket: "schedule", reason: "the sender committed to act; watch for it" } : { bucket: "fyi", reason: "no action needed from you" };
  }
  const urgent = i.urgency === "high" || (i.dueInDays != null && i.dueInDays <= 2);
  const important = i.importance !== "low";
  const someoneElse = !!i.owner && !!i.me && !i.me.toLowerCase().includes(i.owner.toLowerCase());
  if (urgent && someoneElse) return { bucket: "delegate", reason: `urgent, and ${i.owner} owns it` };
  if (urgent && important) return { bucket: "do_now", reason: i.owner === null ? "urgent and nobody owns it yet" : i.dueInDays != null ? `due in ${i.dueInDays} day(s)` : "urgent and important" };
  if (urgent) return { bucket: "delegate", reason: "urgent but low importance for you" };
  if (important) return { bucket: "schedule", reason: "important, not urgent" };
  return { bucket: "fyi", reason: "low urgency and importance" };
}

/** Combine the rules engine and the AI into one type, with agreement-weighted confidence. */
export function combineType(rule: { type: MailType; fallback: boolean }, ai?: { type: MailType; confidence: number } | null): { type: MailType; confidence: number; agreement: "both" | "rules" | "ai" | "disagree" } {
  if (rule.type === "injection") return { type: "injection", confidence: 0.99, agreement: ai?.type === "injection" ? "both" : "rules" };
  if (!ai) return { type: rule.type, confidence: rule.fallback ? 0.4 : 0.75, agreement: "rules" };
  if (ai.type === "injection" || ai.type === "sensitive") return { type: ai.type, confidence: Math.max(ai.confidence, 0.6), agreement: "ai" };
  if (rule.fallback) return { type: ai.type, confidence: ai.confidence, agreement: "ai" };
  if (rule.type === ai.type) return { type: rule.type, confidence: Math.min(0.99, Math.max(ai.confidence, 0.75) + 0.1), agreement: "both" };
  return ai.confidence >= 0.8 ? { type: ai.type, confidence: ai.confidence * 0.8, agreement: "disagree" } : { type: rule.type, confidence: 0.5, agreement: "disagree" };
}

/** Plain-text body without quoted history and signatures. */
export function cleanBody(body: string): string {
  const cut = body.search(/^(-{2,}\s*original message|on .{3,120} wrote:|from: .+\nsent: )/im);
  const head = cut >= 0 ? body.slice(0, cut) : body;
  return head
    .split(/\r?\n/)
    .filter((l) => !/^\s*>/.test(l))
    .join("\n")
    .replace(/\n--\s*\n[\s\S]*$/, "") // "-- " signature block
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
