import { describe, it, expect } from "vitest";
import { runTriage, POLICY } from "../src/index.js";
import fixture from "../../../data/fixture/C16/fixture.json";

describe("pipeline on the starter fixture", () => {
  it("orders emails by received_at, not by id (E10 is first)", () => {
    const r = runTriage(fixture);
    expect(r.ordered_email_ids.slice(0, 4)).toEqual(["E10", "E01", "E11", "E02"]);
  });
  it("policy is draft-only and frozen", () => {
    const r = runTriage(fixture);
    expect(r.policy).toEqual({ draft_only: true, auto_send: false });
    expect(Object.isFrozen(POLICY)).toBe(true);
  });
  it("same fixture gives same hash (idempotent re-import)", () => {
    expect(runTriage(fixture).fixture_hash).toBe(runTriage(JSON.parse(JSON.stringify(fixture))).fixture_hash);
  });
});
