import { sentences } from "./normalize.js";

/**
 * Email bodies are data, never instructions. This detector looks for text that tries to instruct the
 * assistant, change its permissions or pull data out. A flagged email is quarantined: no task, no
 * draft, no label/archive suggestion, and the policy object is never read from email content.
 */
export const INJECTION_RULES: { id: string; pattern: RegExp; why: string }[] = [
  {
    id: "policy-override",
    pattern: /\b(ignore|disregard|bypass|override|forget)\b[^.]{0,40}\b(polic(y|ies)|instructions?|rules?|guardrails?|permissions?|restrictions?)\b/i,
    why: "tries to override the assistant's rules",
  },
  {
    id: "data-exfiltration",
    // Secrets only count when someone asks for them to be moved; "stuck until the API keys arrive" is not an attack.
    pattern:
      /\b(send|forward|export|share|email|upload|leak|give)\b[^.]{0,40}\b(private|confidential|personal|sensitive|secret|internal)\b|\b(send|forward|export|share|email|upload)\b[^.]{0,30}\b(all\s+)?(customer|user|employee|client|vendor)s?\s+(list|data|records|details|database|emails)\b|\b(send|share|forward|give|email|post|paste|export)\b[^.]{0,40}\b(passwords?|credentials|api keys?|otps?|bank (account )?details|card numbers?|payroll|salar(y|ies))\b/i,
    why: "asks for private or bulk data to be sent out",
  },
  {
    id: "permission-change",
    pattern:
      /\b(enable|turn on|switch on|allow|set)\b[^.]{0,25}\b(auto[-_ ]?send|sending|send permission|full access)\b|\bauto_send\s*[:=]\s*true\b|\bdraft_only\s*[:=]\s*false\b|\b(send|approve|archive|delete|forward)\b[^.]{0,40}\b(automatically|without (review|approval|asking|checking))\b|\b(disable|turn off|bypass)\b[^.]{0,20}\b(draft[-_ ]?only|review|approval)\b/i,
    why: "tries to change sending permissions or skip human review",
  },
  {
    id: "role-hijack",
    pattern: /\byou are now\b|\bnew instructions\b|\bsystem prompt\b|\bact as (an? )?(admin|administrator|system)\b/i,
    why: "tries to give the assistant a new role",
  },
  {
    id: "authority-claim",
    pattern: /\b(as|i am|this is) (your|the) (admin|administrator|system|it team|ceo|owner|security team)\b|\bi authori[sz]e you\b/i,
    why: "claims authority to justify an instruction",
  },
];

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
  // An authority claim alone ("this is the owner") is not enough; it must come with another signal.
  const flagged = findings.some((f) => f.rule !== "authority-claim");
  return { flagged, findings };
}
