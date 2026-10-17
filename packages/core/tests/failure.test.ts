import { describe, it, expect } from "vitest";
import { runTriage, FixtureError } from "../src/index.js";
import { fixtureWith } from "./helpers.js";

describe("failure path", () => {
  it("rejects a fixture with a missing received_at with a readable error", () => {
    const bad = { case_id: "C16", records: { emails: [{ email_id: "X1", subject: "s", body: "b" }], policy: { draft_only: true, auto_send: false } } };
    expect(() => runTriage(bad)).toThrow(/received_at/);
  });
  it("names the email in the error", () => {
    const f = fixtureWith({});
    delete (f.records.emails[5] as { received_at?: string }).received_at;
    expect(() => runTriage(f)).toThrow(/emails\[5\] \(E06\)\.received_at/);
  });
  it("rejects a fixture whose policy tries auto_send: true", () => {
    const bad = { case_id: "C16", records: { emails: [{ email_id: "X1", subject: "s", body: "b", received_at: "2026-10-16T09:00:00+05:30" }], policy: { draft_only: true, auto_send: true } } };
    expect(() => runTriage(bad)).toThrow(/auto_send/);
  });
  it("rejects malformed JSON text with a FixtureError", () => {
    expect(() => runTriage('{"case_id": "C16", "records": ')).toThrow(FixtureError);
  });
  it("rejects a received_at without a timezone offset", () => {
    expect(() => runTriage(fixtureWith({ replace: { E06: { received_at: "16/10/2026 14:00" } } }))).toThrow(/received_at/);
  });
  it("received_at: null means unknown: the email is kept, placed last and flagged for review", () => {
    const r = runTriage(fixtureWith({ replace: { E06: { received_at: null as unknown as string } } }));
    expect(r.ordered_email_ids.at(-1)).toBe("E06");
    expect(r.decisions.find((d) => d.email_id === "E06")!.status).toBe("needs_review");
    expect(r.warnings.join(" ")).toMatch(/E06 has received_at: null/);
  });
});
