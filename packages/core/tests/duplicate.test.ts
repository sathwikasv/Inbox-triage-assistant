import { describe, it, expect } from "vitest";
import { runTriage, fixtureHash } from "../src/index.js";
import fixture from "../../../data/fixture/C16/fixture.json";
import { fixtureWith } from "./helpers.js";

describe("duplicates are counted once", () => {
  const r = runTriage(fixture);

  it("E10 arrives first but is a duplicate of E01; the thread has one task", () => {
    const e10 = r.decisions.find((d) => d.email_id === "E10")!;
    expect(e10).toMatchObject({ purpose: "duplicate", duplicate_of: "E01", action_needed: false });
    const t = r.threads.find((t) => t.thread_key === e10.thread_key)!;
    expect(t.duplicate_count).toBe(1);
    expect(r.decisions.filter((d) => d.thread_key === t.thread_key && d.facts.some((f) => f.kind === "task"))).toHaveLength(1);
  });

  it("an email with text identical to an earlier one is a duplicate of it", () => {
    const r2 = runTriage(fixtureWith({ add: [{ email_id: "E13", body: "We need to investigate missing order IDs. No confirmed owner yet." }] }));
    expect(r2.decisions.find((d) => d.email_id === "E13")).toMatchObject({ purpose: "duplicate", duplicate_of: "E06", action_needed: false });
  });
});

describe("re-import is idempotent", () => {
  it("same content gives the same hash and the same decisions", () => {
    const again = runTriage(JSON.parse(JSON.stringify(fixture)));
    expect(again.fixture_hash).toBe(runTriage(fixture).fixture_hash);
    expect(again.decisions).toEqual(runTriage(fixture).decisions);
  });

  it("key order in the file does not change the hash", () => {
    const reordered = { records: fixture.records, case_id: fixture.case_id, ...fixture };
    expect(fixtureHash(reordered)).toBe(fixtureHash(fixture));
  });

  it("a changed body changes the hash", () => {
    expect(fixtureHash(fixtureWith({ replace: { E02: { body: "Correction: due 22 October." } } }))).not.toBe(fixtureHash(fixture));
  });

  it("the same email twice in one file is kept once with a warning", () => {
    const f = fixtureWith({});
    f.records.emails.push({ ...f.records.emails[0] });
    const r = runTriage(f);
    expect(r.decisions).toHaveLength(12);
    expect(r.warnings.join(" ")).toMatch(/E01 appears twice/);
  });

  it("the same email_id with different content is rejected", () => {
    const f = fixtureWith({});
    f.records.emails.push({ ...f.records.emails[0], body: "Something else." });
    expect(() => runTriage(f)).toThrow(/E01 appears twice with different content/);
  });
});
