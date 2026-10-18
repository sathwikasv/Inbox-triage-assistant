import { describe, expect, it } from "vitest";
import { extractDates, toIso, whenFrom, zoneOffset } from "../src/index.js";

// Meeting times written in other zones keep their exact instant, so they can be shown in the reader's own zone.
const RECEIVED = "2026-10-16T09:00:00+05:30";
const instant = (zone: string, time = "3 PM") => {
  const m = extractDates(`Can we meet on 20 October 2026 at ${time} ${zone}?`, RECEIVED)[0];
  const w = whenFrom(m, RECEIVED, "Asia/Kolkata")!;
  return { w, utc: new Date(toIso(w.date, w.time, w.tz_offset)).toISOString() };
};

describe("zone abbreviations in email text", () => {
  it.each([
    ["IST", 330, "2026-10-20T09:30:00.000Z"],
    ["UTC", 0, "2026-10-20T15:00:00.000Z"],
    ["GMT", 0, "2026-10-20T15:00:00.000Z"],
    ["EST", -300, "2026-10-20T20:00:00.000Z"],
    ["EDT", -240, "2026-10-20T19:00:00.000Z"],
    ["PST", -480, "2026-10-20T23:00:00.000Z"],
    ["PDT", -420, "2026-10-20T22:00:00.000Z"],
    ["BST", 60, "2026-10-20T14:00:00.000Z"],
    ["SGT", 480, "2026-10-20T07:00:00.000Z"],
    ["GST", 240, "2026-10-20T11:00:00.000Z"],
  ])("%s is read as UTC%i and keeps the exact instant", (zone, offset, utc) => {
    const r = instant(zone);
    expect(r.w.tz_offset).toBe(offset);
    expect(r.w.tz_source).toBe("stated");
    expect(r.utc).toBe(utc);
  });

  it("flags a zone that differs from the reader's, so the app can convert and say so", () => {
    expect(instant("EST").w.needs_confirmation.join(" ")).toMatch(/stated zone UTC-05:00 differs from yours/);
    expect(instant("IST").w.needs_confirmation).toEqual([]);
  });

  it("India is UTC+05:30 all year (no daylight saving)", () => {
    expect(zoneOffset("Asia/Kolkata", new Date("2026-01-15T00:00:00Z"))).toBe(330);
    expect(zoneOffset("Asia/Kolkata", new Date("2026-07-15T00:00:00Z"))).toBe(330);
  });
});
