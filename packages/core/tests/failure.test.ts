import { describe, it, expect } from "vitest";
import { runTriage } from "../src/index.js";

describe("failure path", () => {
  it("rejects a fixture with a missing received_at with a readable error", () => {
    const bad = { case_id: "C16", records: { emails: [{ email_id: "X1", subject: "s", body: "b" }], policy: { draft_only: true, auto_send: false } } };
    expect(() => runTriage(bad)).toThrow(/received_at/);
  });
  it("rejects a fixture whose policy tries auto_send: true", () => {
    const bad = { case_id: "C16", records: { emails: [{ email_id: "X1", subject: "s", body: "b", received_at: "2026-10-16T09:00:00+05:30" }], policy: { draft_only: true, auto_send: true } } };
    expect(() => runTriage(bad)).toThrow(/auto_send/);
  });
});
