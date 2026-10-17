import type { Purpose, RawEmail } from "./types.js";
import { splitQuoted } from "./normalize.js";
import { classifyPurpose } from "./classify.js";
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
  dates: DateMention[];
  owner: OwnerMention | null;
  references: string[];
  already_tracked: string | null;
  anaphora: Anaphora;
  status: StatusSignals;
  task: string | null;
  clarify: string[];
}

export function analyzeEmail(email: RawEmail): AnalyzedEmail {
  const { fresh, quoted } = splitQuoted(email.body);
  const injection = detectInjection(email.body); // whole body: quoted instructions are still hostile
  const cls = injection.flagged
    ? { purpose: "injection" as const, why: injection.findings.map((f) => f.why).join("; ") }
    : classifyPurpose(fresh);
  return {
    email,
    fresh,
    quoted,
    injection,
    purpose: cls.purpose,
    purpose_why: cls.why,
    dates: extractDates(fresh, email.received_at),
    owner: extractOwner(fresh),
    references: extractReferences(fresh),
    already_tracked: ALREADY_TRACKED.exec(fresh)?.[0] ?? null,
    anaphora: extractAnaphora(fresh),
    status: extractStatus(fresh),
    task: extractTask(fresh, cls.purpose),
    clarify: cls.purpose === "question" ? extractClarify(fresh) : [],
  };
}
