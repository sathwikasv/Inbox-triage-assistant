import { sentences } from "./normalize.js";

/**
 * Email bodies are data, never instructions. This detector looks for text that tries to instruct the
 * assistant, change its permissions or pull data out. A flagged email is quarantined: no task, no
 * draft, no label/archive suggestion, and the policy object is never read from email content.
 */
export const INJECTION_RULES: { id: string; pattern: RegExp; why: string }[] = [
  {
    id: "policy-override",
    pattern: /\b(ignore|disregard|bypass|override|forget)\b[^.]{0,40}\b(polic(y|ies)|instructions?|rules?|guardrails?|guidelines?|safeguards?|permissions?|restrictions?|settings?|draft[- ]only)\b/i,
    why: "tries to override the assistant's rules",
  },
  {
    id: "data-exfiltration",
    // Moving secrets, or bulk records ("all / full / entire …", or to a personal address), is suspicious.
    // Ordinary work is not: "share the vendor list with Priya", "stuck until the API keys arrive".
    pattern:
      /\b(send|forward|export|share|email|mail|upload|leak|give)\b[^.]{0,40}\b(private|confidential|personal|sensitive|secret|internal)\b|\b(send|forward|export|share|email|mail|upload|dump)\b[^.]{0,40}\b(all|full|entire|whole|complete|every)\b[^.]{0,20}\b(customer|user|employee|client|vendor|supplier)s?\b[^.]{0,15}\b(list|data|records|details|database|emails|contacts)\b|\b(send|share|forward|give|email|mail|post|paste|export|reply with|provide|tell me)\b[^.]{0,40}\b(passwords?|passcodes?|credentials|login details|api keys?|otps?|bank (account )?details|card numbers?|payroll|salar(y|ies))\b/i,
    why: "asks for private or bulk data to be sent out",
  },
  {
    id: "permission-change",
    pattern:
      /\b(enable|turn on|switch on|allow|set)\b[^.]{0,25}\b(auto[-_ ]?send|sending|send permission|full access)\b|\bauto_send\s*[:=]\s*true\b|\bdraft_only\s*[:=]\s*false\b|\b(send|approve|archive|delete|forward)\b[^.]{0,90}\b(automatically|without (review|approval|asking|checking))\b|\b(disable|turn off|bypass)\b[^.]{0,20}\b(draft[-_ ]?only|review|approval)\b|\b(forward|send|email|mail)\b[^.]{0,30}\b(all|every|each)\b[^.]{0,60}\bto\s+\S+@\S+/i,
    why: "tries to change sending permissions, skip human review or move mail out in bulk",
  },
  {
    id: "role-hijack",
    pattern: /\byou are now\b|\bnew instructions\b|\bsystem prompt\b|\bact as (an? )?(admin|administrator|system)\b|^\s*(hey\s+)?(assistant|ai|bot|triage bot|system|copilot)\s*[:,]/i,
    why: "tries to give the assistant a new role",
  },
  {
    id: "authority-claim",
    pattern: /\b(as|i am|this is) (your|the) (admin|administrator|system|it team|ceo|owner|security team)\b|\bi authori[sz]e you\b/i,
    why: "claims authority to justify an instruction",
  },
  {
    id: "records-request",
    pattern: /\b(send|forward|export|share|email|mail|give)\b[^.]{0,30}\b(customer|user|employee|client|staff)s?\b[^.]{0,10}\b(list|data|records|details|database|emails|contacts)\b/i,
    why: "asks for customer or staff records",
  },
  {
    id: "outside-destination",
    pattern: /\bto me\b|\bto my (personal|private|own)\b|\b(personal|private) (email|address|gmail|account|inbox)\b|@(gmail|yahoo|outlook|hotmail|proton)\./i,
    why: "points the data at a personal or outside address",
  },
];

// Signals that are normal on their own and only count together with another one.
const WEAK = new Set(["authority-claim", "records-request", "outside-destination"]);

export interface InjectionResult {
  flagged: boolean;
  findings: { rule: string; why: string; quote: string }[];
}

export function detectInjection(text: string): InjectionResult {
  const findings: InjectionResult["findings"] = [];
  for (const r of INJECTION_RULES) {
    const s = sentences(text).find((x) => r.pattern.test(x.text));
    if (s) findings.push({ rule: r.id, why: r.why, quote: s.text });
  }
  // An authority claim, a records request or "send it to me" alone is ordinary mail; a records request
  // backed by claimed authority or aimed at an outside address is an attempt to pull data out.
  const has = (id: string) => findings.some((f) => f.rule === id);
  const flagged = findings.some((f) => !WEAK.has(f.rule)) || (has("records-request") && (has("authority-claim") || has("outside-destination")));
  return { flagged, findings };
}
