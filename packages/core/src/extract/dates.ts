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
export function extractDates(text: string, receivedAt: string | null): DateMention[] {
  const ref = receivedAt
    ? { instant: new Date(receivedAt), timezone: offsetMinutes(receivedAt) }
    : { instant: new Date(Date.UTC(2000, 0, 1)), timezone: 0 };
  const out: DateMention[] = [];
  for (const r of chrono.parse(text, ref, { forwardDate: true })) {
    const sentence = sentenceAt(text, r.index);
    const relative = RELATIVE.test(r.text);
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
