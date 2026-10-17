import type { RawEmail } from "./types.js";

/**
 * Sort by received_at ascending, tie-break by email_id. Fixture order is NOT chronological.
 * Emails with an unknown (null) received_at go last.
 */
export function sortEmails(emails: RawEmail[]): RawEmail[] {
  return [...emails].sort((a, b) => {
    if (a.received_at === null || b.received_at === null) {
      if (a.received_at !== b.received_at) return a.received_at === null ? 1 : -1;
    } else {
      const t = Date.parse(a.received_at) - Date.parse(b.received_at);
      if (t !== 0) return t;
    }
    return a.email_id.localeCompare(b.email_id, "en", { numeric: true });
  });
}

/**
 * The same email_id twice with identical content is a re-delivery: keep one, warn.
 * The same email_id with different content is ambiguous: reject the import.
 */
export function dedupeById(emails: RawEmail[]): { emails: RawEmail[]; warnings: string[] } {
  const seen = new Map<string, RawEmail>();
  const warnings: string[] = [];
  for (const e of emails) {
    const prev = seen.get(e.email_id);
    if (!prev) {
      seen.set(e.email_id, e);
      continue;
    }
    if (prev.body === e.body && prev.subject === e.subject && prev.received_at === e.received_at) {
      warnings.push(`${e.email_id} appears twice with identical content; kept once.`);
    } else {
      throw new Error(`Invalid fixture: ${e.email_id} appears twice with different content; fix the source file.`);
    }
  }
  return { emails: [...seen.values()], warnings };
}

const QUOTE_START = [
  /^-{2,}\s*original message\s*-{2,}/im,
  /^-{2,}\s*forwarded message\s*-{2,}/im,
  /^on .{3,120} wrote:\s*$/im,
  /^from:\s.+$/im,
];

/**
 * Split a body into the sender's fresh text and quoted history. Facts are only extracted from the
 * fresh part, so an FYI that quotes an old deadline does not create a new action.
 */
export function splitQuoted(body: string): { fresh: string; quoted: string } {
  let cut = body.length;
  for (const re of QUOTE_START) {
    const m = re.exec(body);
    if (m && m.index < cut) cut = m.index;
  }
  const head = body.slice(0, cut);
  const freshLines: string[] = [];
  const quotedLines: string[] = [];
  for (const line of head.split(/\r?\n/)) (/^\s*>/.test(line) ? quotedLines : freshLines).push(line);
  const quoted = [quotedLines.join("\n"), body.slice(cut)].filter((s) => s.trim()).join("\n");
  return { fresh: freshLines.join("\n").trim(), quoted };
}

/** Lowercased, whitespace-collapsed text for exact-duplicate detection. */
export function canonicalText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Sentences as exact substrings of the input, so evidence quotes always match the source. */
export function sentences(text: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  const re = /[^.;!?\n]+[.;!?]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (t) out.push({ text: t, start: m.index + lead });
  }
  return out;
}

export function sentenceAt(text: string, index: number): string {
  for (const s of sentences(text)) if (index >= s.start && index < s.start + s.text.length) return s.text;
  return text.trim();
}
