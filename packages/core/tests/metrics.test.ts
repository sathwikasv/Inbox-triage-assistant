import { describe, it, expect } from "vitest";
import { runTriage, computeMetrics, type Labels } from "../src/index.js";
import fixture from "../../../data/fixture/C16/fixture.json";
import rawLabels from "../../../data/labels/C16_labels.json";
import { fixtureWith } from "./helpers.js";

const labels = rawLabels as unknown as Labels;

describe("metrics on the starter fixture with labels", () => {
  const m = runTriage(fixture, { labels }).metrics;

  it("recovers all 7 seeded critical items with evidence", () => {
    expect(m.seeded_total).toBe(7);
    expect(m.seeded_recovered).toBe(7);
    for (const s of m.seeded) expect(s.detail).toMatch(/^recovered from "/);
  });

  it("action flags, remaining decisions and thread grouping all match", () => {
    expect(m.precision_action_flags).toBe(1);
    expect(m.recall_action_flags).toBe(1);
    expect(m.remaining_accuracy).toBe(1);
    expect(m.thread_pair_agreement).toBe(1);
    expect(m.mismatches).toEqual([]);
  });

  it("all three case checks pass", () => {
    expect(m.checks.map((c) => [c.id, c.passed])).toEqual([
      [1, true],
      [2, true],
      [3, true],
    ]);
  });
});

describe("metrics are not vacuous", () => {
  it("without labels, Check 1 is not applicable but Checks 2 and 3 still run", () => {
    const m = runTriage(fixture).metrics;
    expect(m.labels_applied).toBe(false);
    expect(m.checks.map((c) => c.passed)).toEqual([null, true, true]);
  });

  it("a wrong decision lowers recall and is listed as a mismatch", () => {
    const r = runTriage(fixture);
    const broken = { ...r, decisions: r.decisions.map((d) => (d.email_id === "E06" ? { ...d, facts: [], action_needed: false } : d)) };
    const m = computeMetrics(broken, labels);
    expect(m.seeded_recovered).toBe(6);
    expect(m.seeded.find((s) => s.email_id === "E06")!.detail).toMatch(/escalation not raised/);
    expect(m.recall_action_flags).toBeLessThan(1);
    expect(m.checks[0].passed).toBe(false);
  });

  it("a changed deadline is visible against the starter labels (E02 no longer matches)", () => {
    const m = runTriage(fixtureWith({ replace: { E02: { body: "Correction: due 22 October. Keep one ticket only." } } }), { labels }).metrics;
    expect(m.seeded.find((s) => s.email_id === "E02")!.recovered).toBe(false);
  });

  it("a draft with a forbidden claim fails Check 2", () => {
    const r = runTriage(fixture);
    const bad = { ...r, drafts: r.drafts.map((d, i) => (i === 0 ? { ...d, lint_ok: false } : d)) };
    expect(computeMetrics(bad).checks[1].passed).toBe(false);
  });

  it("a draft for the quarantined email fails Checks 2 and 3", () => {
    const r = runTriage(fixture);
    const bad = { ...r, drafts: [...r.drafts, { thread_key: "QUARANTINE", body: "ok", source: "template" as const, lint_ok: true, violations: [] }] };
    const m = computeMetrics(bad);
    expect(m.checks[1].passed).toBe(false);
    expect(m.checks[2].passed).toBe(false);
  });
});
