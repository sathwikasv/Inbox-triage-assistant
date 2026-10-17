import * as chrono from "chrono-node";
import { sentenceAt } from "../normalize.js";

export interface DateMention {
  date: string | null; // YYYY-MM-DD in the sender's timezone; null when it cannot be anchored
  text: string; // the date words, e.g. "20 October" or "tomorrow"
  sentence: string; // exact sentence from the body, used as evidence
  cue: "due" | "relative" | "mention";
  time: string | null; // "16:00" when an hour is stated; null for a date with no time
  end_time: string | null; // "16:30" for ranges such as "3-4 PM"
  tz_offset: number | null; // minutes east of UTC, only when the text states a zone ("3 PM IST", "10am PST")
}

const DUE_CUE = /\b(due|deadline|by|before|no later than)\b/i;
const RELATIVE = /\b(today|tomorrow|tonight|yesterday|next|this|in \d+ days?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

function offsetMinutes(iso: string): number {
  if (/z$/i.test(iso)) return 0;
  const m = /([+-])(\d{2}):?(\d{2})$/.exec(iso);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Dates mentioned in the fresh text, resolved against the email's own received_at and timezone
 * ("Due 18 October" sent on 16 Oct 2026 IST → 2026-10-18; "tomorrow" → the next IST day).
 */
/**
 * chrono reads "22 October 3-4 PM" as "October 3-4". Writing "22 October from 3-4 PM" fixes that; the
 * inserted text is tracked so every mention still points at the original sentence.
 */
const DATE_THEN_RANGE = /(\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?)(\s+)(?=\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-\u2013]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b)/gi;

function normalizeRanges(text: string): { text: string; toOriginal: (i: number) => number } {
  const inserts: number[] = []; // positions (in the normalised text) where " from" was added
  let added = 0;
  const out = text.replace(DATE_THEN_RANGE, (_m, date: string, space: string, offset: number) => {
    inserts.push(offset + added + date.length);
    added += 5;
    return `${date} from${space}`;
  });
  return { text: out, toOriginal: (i) => i - inserts.filter((p) => p < i).length * 5 };
}

export function extractDates(text: string, receivedAt: string | null): DateMention[] {
  const ref = receivedAt
    ? { instant: new Date(receivedAt), timezone: offsetMinutes(receivedAt) }
    : { instant: new Date(Date.UTC(2000, 0, 1)), timezone: 0 };
  const out: DateMention[] = [];
  const norm = normalizeRanges(text);
  for (const r of chrono.parse(norm.text, ref, { forwardDate: true })) {
    const sentence = sentenceAt(text, norm.toOriginal(r.index));
    const relative = RELATIVE.test(r.text);
    // "Starting September 2026" names a month, not a day: never turn it into a date or deadline.
    if (!r.start.isCertain("day") && !r.start.isCertain("weekday") && !r.start.isCertain("hour") && !relative) continue;
    const anchored = receivedAt !== null || (r.start.isCertain("year") && !relative);
    const date = anchored
      ? `${r.start.get("year")}-${pad(r.start.get("month")!)}-${pad(r.start.get("day")!)}`
      : null;
    const cue = DUE_CUE.test(sentence) ? "due" : relative ? "relative" : "mention";
    const hm = (c: chrono.ParsedComponents | null | undefined) => (c && c.isCertain("hour") ? `${pad(c.get("hour")!)}:${pad(c.get("minute") ?? 0)}` : null);
    const tz = r.start.isCertain("timezoneOffset") ? (r.start.get("timezoneOffset") ?? null) : null;
    out.push({ date, text: r.text, sentence, cue, time: hm(r.start), end_time: hm(r.end), tz_offset: tz });
  }
  return out;
}

/** "2026-10-20" → "20 October 2026". Used by drafts so the wording matches the extracted fact. */
export function formatDate(ymd: string): string {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${Number(ymd.slice(8, 10))} ${months[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(0, 4)}`;
}
