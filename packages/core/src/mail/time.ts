import type { DateMention } from "../extract/dates.js";
import type { WhenSpec } from "./types.js";

const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");

/** Minutes east of UTC for an ISO timestamp's own offset ("+05:30" → 330, "Z" → 0). */
export function offsetOfIso(iso: string): number {
  if (/z$/i.test(iso)) return 0;
  const m = /([+-])(\d{2}):?(\d{2})$/.exec(iso);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/** Minutes east of UTC for an IANA zone at an instant, e.g. ("Asia/Kolkata", now) → 330. */
export function zoneOffset(timeZone: string, at: Date = new Date()): number {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    const m = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(name);
    return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
  } catch {
    return 0;
  }
}

export const offsetLabel = (min: number) => `${min < 0 ? "-" : "+"}${pad(Math.trunc(min / 60))}:${pad(min % 60)}`;

/** "2026-10-19", "16:00", 330 → "2026-10-19T16:00:00+05:30". */
export function toIso(date: string, time: string | null, offsetMin: number): string {
  return `${date}T${time ?? "00:00"}:00${offsetLabel(offsetMin)}`;
}

export function addMinutes(iso: string, minutes: number): string {
  const off = offsetOfIso(iso);
  const t = new Date(Date.parse(iso) + minutes * 60_000 + off * 60_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:00${offsetLabel(off)}`;
}

/** Calendar day of an instant in a given offset. */
export function dayIn(iso: string, offsetMin: number): string {
  const t = new Date(Date.parse(iso) + offsetMin * 60_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/**
 * Turns a date mention into a WhenSpec, saying exactly what was assumed. The zone comes from the text if
 * stated, else from the sender's own timestamp; if that differs from the user's zone, a person confirms.
 */
export function whenFrom(m: DateMention, receivedAt: string, userZone: string): WhenSpec | null {
  if (!m.date) return null;
  const sender = offsetOfIso(receivedAt);
  const user = zoneOffset(userZone, new Date(receivedAt));
  const tz = m.tz_offset ?? sender;
  const needs: string[] = [];
  if (!m.time) needs.push("no time given");
  if (m.tz_offset === null && m.time && sender !== user) needs.push(`time read in the sender's zone (UTC${offsetLabel(sender)}); yours is UTC${offsetLabel(user)}`);
  if (m.tz_offset !== null && m.tz_offset !== user) needs.push(`stated zone UTC${offsetLabel(m.tz_offset)} differs from yours`);
  if (/\b(next|this)\s+(mon|tues|wednes|thurs|fri|satur|sun)day\b/i.test(m.text)) needs.push(`"${m.text}" can mean two different weeks`);
  return { date: m.date, time: m.time, end_time: m.end_time, tz_offset: tz, tz_source: m.tz_offset !== null ? "stated" : "sender", text: m.text, needs_confirmation: needs };
}
