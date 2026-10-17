import { describe, it, expect } from "vitest";
import { runTriage } from "../src/index.js";
import robustness from "./fixtures/robustness.json";

/** Triage one email on its own, as a one-email inbox. */
function purposeOf(id: string, body: string) {
  const r = runTriage({ case_id: "C16", records: { emails: [{ email_id: id, subject: "x", body, received_at: "2026-10-16T10:00:00+05:30" }], policy: { draft_only: true, auto_send: false } } });
  return r.decisions[0].purpose;
}

describe("rules on new phrasings (robustness set, 70 emails)", () => {
  // Baseline before broadening the rules: 32/70 (45.7%). The rules were then tuned on this set and on
  // heldout.json (v1, now a development set),
  // so it guards against regressions; the honest generalisation number comes from heldout.json.
  it.each(robustness.emails.map((e) => [e.id, e.purpose, e.body]))("%s is %s", (id, purpose, body) => {
    expect(purposeOf(id, body)).toBe(purpose);
  });

  it("negatives: 'not resolved yet' is progress, a resolved blocker is a resolution", () => {
    expect(purposeOf("N1", "Not resolved yet, still checking.")).toBe("status_update");
    expect(purposeOf("N2", "The fix is not done yet.")).toBe("status_update");
    expect(purposeOf("N3", "The earlier blocker is resolved; the file is now attached.")).toBe("resolution");
  });
});
