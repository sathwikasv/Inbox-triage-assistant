import { offsetLabel, zoneOffset } from "@c16/core";

// One place for time zones. The app shows every time in the person's own zone, Asia/Kolkata (IST, UTC+05:30)
// unless they chose another, whatever zone the sender, the provider or the calendar used.

export const DEFAULT_ZONE = "Asia/Kolkata";

/** Browsers report some zones under old names ("Asia/Calcutta"); map them to the current one. */
const ALIASES: Record<string, string> = { "Asia/Calcutta": "Asia/Kolkata", "Asia/Saigon": "Asia/Ho_Chi_Minh", "Asia/Katmandu": "Asia/Kathmandu", "Asia/Rangoon": "Asia/Yangon" };

export function resolveUserTimezone(zone?: string | null): string {
  let z = zone || "";
  if (!z) {
    try {
      z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      z = "";
    }
  }
  return ALIASES[z] ?? (z || DEFAULT_ZONE);
}

const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");

/** Any timestamp (UTC, EST, +05:30 ...) as an ISO string written in the target zone: "2026-10-18T09:30:00Z" → "2026-10-18T15:00:00+05:30". */
export function toZoneIso(input: string | number | Date, timeZone: string = DEFAULT_ZONE): string {
  const d = new Date(input);
  const off = zoneOffset(timeZone, d);
  const t = new Date(d.getTime() + off * 60_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}${offsetLabel(off)}`;
}

/** A calendar date and a wall-clock time in one zone (e.g. "2026-10-19", "15:00", EST) shown as date and time in another zone. */
export function convertWall(date: string, time: string, fromOffsetMin: number, timeZone: string = DEFAULT_ZONE): { date: string; time: string } {
  const iso = `${date}T${time}:00${offsetLabel(fromOffsetMin)}`;
  const z = toZoneIso(iso, timeZone);
  return { date: z.slice(0, 10), time: z.slice(11, 16) };
}

/** "IST" for Asia/Kolkata, otherwise the zone's short name ("EST", "BST", "GMT+1"). */
export function zoneAbbr(timeZone: string = DEFAULT_ZONE, at: Date = new Date()): string {
  if (timeZone === "Asia/Kolkata") return "IST";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

/** "UTC+5:30" for a zone at an instant. */
export function zoneUtcLabel(timeZone: string = DEFAULT_ZONE, at: Date = new Date()): string {
  const off = zoneOffset(timeZone, at);
  return `UTC${off < 0 ? "-" : "+"}${Math.trunc(Math.abs(off) / 60)}${Math.abs(off) % 60 ? `:${pad(Math.abs(off) % 60)}` : ""}`;
}

/** Midnight of a calendar date in a zone: all-day events keep their date instead of shifting with UTC. */
export const dayStartIso = (date: string, timeZone: string = DEFAULT_ZONE) => `${date}T00:00:00${offsetLabel(zoneOffset(timeZone, new Date(`${date}T12:00:00Z`)))}`;
