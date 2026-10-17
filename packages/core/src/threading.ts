import type { AnalyzedEmail } from "./analyze.js";
import { canonicalText } from "./normalize.js";

export const QUARANTINE = "QUARANTINE";

/**
 * Topic vocabulary. Subjects are NOT used for topics: in the fixture they are misleading
 * ("Invoice review" on a duplicate-ticket email). Extend this table for new inbox vocabulary.
 */
export const TOPICS: { key: string; title: string; patterns: RegExp[] }[] = [
  { key: "dup-ticket", title: "Duplicate ticket creation", patterns: [/\bduplicate[- ]tickets?\b/i, /\bone ticket\b/i, /\bticket creation\b/i] },
  { key: "export", title: "Export", patterns: [/\bexports?\b/i] },
  { key: "catalogue", title: "Catalogue review", patterns: [/\bcatalog(ue)?s?\b/i] },
  { key: "missing-ids", title: "Missing order IDs", patterns: [/\border ids?\b/i] },
  { key: "test-data", title: "Pilot test data", patterns: [/\btest data\b/i] },
  { key: "invoice", title: "Invoice", patterns: [/\binvoices?\b/i] },
  { key: "refund", title: "Refund", patterns: [/\brefunds?\b/i] },
  { key: "shipment", title: "Shipment", patterns: [/\bshipments?\b/i, /\bdelivery\b/i] },
];

const STOP = new Set(
  ("a an the is are was were be been to of in on at by for from with and or but not no yet still now this that these those " +
    "it its we you i he she they me us them our your my please kindly can could would should will shall need needs " +
    "do does did done have has had same above earlier below again just also only one any all some which what when " +
    "who how why issue request email message thanks thank hi hello team review complete completed resolved almost " +
    "due owner correction keep tomorrow today chase").split(" "),
);

function contentWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? []) {
    if (STOP.has(raw)) continue;
    out.add(raw.replace(/(ing|ed|er|es|s)$/, ""));
  }
  return out;
}

export interface ThreadAssignment {
  thread_key: string;
  title: string;
  rule: string;
  inferred: boolean;
  exact_duplicate_of?: string;
}

interface ThreadState {
  key: string;
  title: string;
  emails: AnalyzedEmail[];
  refs: Set<string>;
  words: Set<string>;
}

const time = (a: AnalyzedEmail) => (a.email.received_at ? Date.parse(a.email.received_at) : Number.POSITIVE_INFINITY);
const sameSubject = (a: AnalyzedEmail, b: AnalyzedEmail) =>
  a.email.subject.trim().toLowerCase() === b.email.subject.trim().toLowerCase();

/** Assign every email (already sorted by received_at) to a thread. */
export function assignThreads(items: AnalyzedEmail[]): Map<string, ThreadAssignment> {
  const out = new Map<string, ThreadAssignment>();
  const threads = new Map<string, ThreadState>();
  const seenText = new Map<string, string>(); // canonical fresh text → email_id
  const pending: AnalyzedEmail[] = [];

  const join = (a: AnalyzedEmail, key: string, title: string, rule: string, inferred = false, dup?: string) => {
    let t = threads.get(key);
    if (!t) threads.set(key, (t = { key, title, emails: [], refs: new Set(), words: new Set() }));
    t.emails.push(a);
    a.references.forEach((r) => t!.refs.add(r));
    contentWords(a.fresh).forEach((w) => t!.words.add(w));
    out.set(a.email.email_id, { thread_key: key, title: t.title, rule, inferred, exact_duplicate_of: dup });
  };
  const latest = (pred: (t: ThreadState) => boolean) =>
    [...threads.values()].filter((t) => t.key !== QUARANTINE && pred(t)).sort((x, y) => time(y.emails.at(-1)!) - time(x.emails.at(-1)!))[0];

  // Pass 1: direct content evidence, in time order.
  for (const a of items) {
    const id = a.email.email_id;
    if (a.purpose === "injection") {
      join(a, QUARANTINE, "Quarantined: instruction-like content", "instruction-like text; quarantined, never threaded with real work");
      continue;
    }
    const canon = canonicalText(a.fresh);
    const twin = seenText.get(canon);
    if (twin) {
      const t = out.get(twin)!;
      join(a, t.thread_key, t.title, `identical text to ${twin}`, false, twin);
      continue;
    }
    seenText.set(canon, id);

    const byRef = a.references.map((r) => [...threads.values()].find((t) => t.refs.has(r))).find(Boolean);
    if (byRef) {
      join(a, byRef.key, byRef.title, `shares tracker id ${a.references.find((r) => byRef.refs.has(r))}`);
      continue;
    }
    const topic = TOPICS.find((t) => t.patterns.some((p) => p.test(a.fresh)));
    if (topic) {
      join(a, `T-${topic.key}`, topic.title, `names the topic "${topic.title.toLowerCase()}"`);
      continue;
    }
    if (a.anaphora.blocker) {
      const t = latest((t) => t.emails.some((e) => e.purpose === "blocker"));
      if (t) {
        join(a, t.key, t.title, `refers to the earlier blocker (${t.emails.find((e) => e.purpose === "blocker")!.email.email_id})`);
        continue;
      }
    }
    if (a.purpose === "correction") {
      const t = latest((t) => t.emails.some((e) => e.dates.some((d) => d.cue === "due")));
      if (t) {
        join(a, t.key, t.title, "correction applies to the latest thread that has a deadline");
        continue;
      }
    }
    if (a.anaphora.same_request) {
      const t = latest((t) => t.emails.some((e) => e.purpose === "request"));
      if (t) {
        join(a, t.key, t.title, "refers to the same earlier request");
        continue;
      }
    }
    const words = contentWords(a.fresh);
    const overlap = [...threads.values()]
      .filter((t) => t.key !== QUARANTINE)
      .map((t) => ({ t, shared: [...words].filter((w) => t.words.has(w)) }))
      .filter((x) => x.shared.length >= 2)
      .sort((x, y) => y.shared.length - x.shared.length)[0];
    if (overlap) {
      join(a, overlap.t.key, overlap.t.title, `shares the terms ${overlap.shared.join(", ")}`);
      continue;
    }
    pending.push(a);
  }

  // Pass 2: last-resort links for emails with no topic of their own. Marked inferred for the reviewer.
  for (const a of pending) {
    const anchor = (t: ThreadState) => t.emails.find((e) => ["request", "blocker", "question"].includes(e.purpose));

    if (a.purpose === "fyi" && (a.references.length || a.already_tracked || a.anaphora.this_item)) {
      const cands = [...threads.values()]
        .filter((t) => t.key !== QUARANTINE && t.refs.size === 0 && anchor(t) && sameSubject(anchor(t)!, a))
        .sort((x, y) => Math.abs(time(anchor(x)!) - time(a)) - Math.abs(time(anchor(y)!) - time(a)));
      if (cands[0]) {
        const an = anchor(cands[0])!;
        join(a, cands[0].key, cands[0].title, `tracker note with no topic; linked to the open item ${an.email.email_id} with the same subject and no tracker id yet`, true);
        continue;
      }
    }
    if (a.purpose === "status_update") {
      const t = [...threads.values()]
        .filter((t) => t.key !== QUARANTINE && t.emails[0].purpose === "resolution" && time(t.emails[0]) > time(a))
        .sort((x, y) => time(x.emails[0]) - time(y.emails[0]))[0];
      if (t) {
        join(a, t.key, t.title, `progress note with no topic; linked to the next completion of unannounced work (${t.emails[0].email.email_id})`, true);
        continue;
      }
    }
    const key = a.references[0] ? `T-${a.references[0]}` : `T-${a.email.email_id}`;
    const title = a.task ?? (a.clarify.length ? `Clarify ${a.clarify.join(" and ")}` : a.fresh.slice(0, 60));
    join(a, key, title, "no shared topic or reference with any other email");
  }
  return out;
}
