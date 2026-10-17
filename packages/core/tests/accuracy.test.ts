import { describe, it, expect } from "vitest";
import { runTriage, type Purpose } from "../src/index.js";
import robustness from "./fixtures/robustness.json";
import dev from "./fixtures/heldout.json";
import heldoutV2 from "./fixtures/heldout_v2.json";

type Row = { id: string; purpose: string; body: string };

function accuracy(rows: Row[]) {
  let ok = 0;
  const misses: string[] = [];
  for (const e of rows) {
    const r = runTriage({ case_id: "C16", records: { emails: [{ email_id: e.id, subject: "-", body: e.body, received_at: "2026-10-16T10:00:00+05:30" }], policy: { draft_only: true, auto_send: false } } });
    const got: Purpose = r.decisions[0].purpose;
    if (got === e.purpose) ok++;
    else misses.push(`${e.id}: ${e.purpose} → ${got}`);
  }
  return { ok, n: rows.length, rate: ok / rows.length, misses };
}

// History (see docs/accuracy.md). Each email is triaged on its own, as a one-email inbox.
//   robustness (70, tuned on):          32/70 → 70/70
//   heldout v1 (40, now the dev set):   10/40 → 40/40
//   heldout v2 (60, committed before tuning, scored once after): 34/60 blind → 60/60
// These thresholds stop a rule change from silently undoing that work.
describe("email-type accuracy (rules only)", () => {
  it("robustness set: every email", () => {
    const a = accuracy(robustness.emails);
    expect(a.misses).toEqual([]);
  });
  it("v1 dev set: at least 95%", () => {
    const a = accuracy(dev.emails);
    expect(a.rate, a.misses.join("; ")).toBeGreaterThanOrEqual(0.95);
  });
  it("held-out v2: at least 95%, and every injection quarantined", () => {
    const a = accuracy(heldoutV2.emails);
    expect(a.rate, a.misses.join("; ")).toBeGreaterThanOrEqual(0.95);
    expect(a.misses.filter((m) => m.includes("injection"))).toEqual([]);
  });
});
