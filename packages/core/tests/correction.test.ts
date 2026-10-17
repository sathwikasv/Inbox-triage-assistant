import { describe, it, expect } from "vitest";
import { runTriage } from "../src/index.js";
import fixture from "../../../data/fixture/C16/fixture.json";
import { fixtureWith } from "./helpers.js";

const thread = (r: ReturnType<typeof runTriage>, id: string) => {
  const key = r.decisions.find((d) => d.email_id === id)!.thread_key;
  return r.threads.find((t) => t.thread_key === key)!;
};

describe("deadline correction", () => {
  it("E02 'due 20 October' supersedes E01 'due 18 October'", () => {
    const r = runTriage(fixture);
    const t = thread(r, "E01");
    expect(t.latest_due).toBe("2026-10-20");
    expect(t.owner).toBe("Dev");
    const e01due = r.decisions.find((d) => d.email_id === "E01")!.facts.find((f) => f.kind === "due")!;
    const e02due = r.decisions.find((d) => d.email_id === "E02")!.facts.find((f) => f.kind === "due")!;
    expect(e01due).toMatchObject({ value: "2026-10-18", superseded_by: "E02" });
    expect(e02due).toMatchObject({ value: "2026-10-20", supersedes: ["E01"] });
    expect(t.constraints).toContain("Keep one ticket only");
  });

  it("changed input: moving the correction to 22 October moves the deadline, same rule", () => {
    const r = runTriage(fixtureWith({ replace: { E02: { body: "Correction: due 22 October. Keep one ticket only." } } }));
    expect(thread(r, "E01").latest_due).toBe("2026-10-22");
  });

  it("a later plain date does not override an explicit correction", () => {
    const r = runTriage(fixtureWith({ add: [{ email_id: "E13", body: "Please fix duplicate ticket creation. Due 19 October." }] }));
    expect(thread(r, "E01").latest_due).toBe("2026-10-20");
  });

  it("removing the correction leaves the original 18 October deadline", () => {
    const r = runTriage(fixtureWith({ remove: ["E02"] }));
    expect(thread(r, "E01").latest_due).toBe("2026-10-18");
  });

  it("'tomorrow' resolves against the email's own IST date", () => {
    const r = runTriage(fixture);
    expect(thread(r, "E04").watch_date).toBe("2026-10-17");
  });
});
