import { describe, it, expect } from "vitest";
import { runTriage, POLICY } from "../src/index.js";
import fixture from "../../../data/fixture/C16/fixture.json";
import labels from "../../../data/labels/C16_labels.json";

const r = runTriage(fixture);
const byId = new Map(r.decisions.map((d) => [d.email_id, d]));

describe("pipeline on the starter fixture", () => {
  it("orders emails by received_at, not by id (E10 is first)", () => {
    expect(r.ordered_email_ids).toEqual(["E10", "E01", "E11", "E02", "E12", "E03", "E04", "E05", "E06", "E07", "E08", "E09"]);
  });
  it("policy is draft-only and frozen", () => {
    expect(r.policy).toEqual({ draft_only: true, auto_send: false });
    expect(Object.isFrozen(POLICY)).toBe(true);
  });
  it("same fixture gives same hash (idempotent re-import)", () => {
    expect(runTriage(fixture).fixture_hash).toBe(runTriage(JSON.parse(JSON.stringify(fixture))).fixture_hash);
  });
});

describe("expected vs actual on all 12 labelled emails", () => {
  it.each(labels.labels.map((l) => [l.email_id, l]))("%s", (id, l) => {
    const d = byId.get(id as string)!;
    expect({ purpose: d.purpose, urgency: d.urgency, action_needed: d.action_needed, status: d.status, duplicate_of: d.duplicate_of }).toEqual({
      purpose: l.purpose,
      urgency: l.urgency,
      action_needed: l.action_needed,
      status: l.status,
      duplicate_of: l.duplicate_of,
    });
  });

  it("groups emails into the same threads as the labels (by content, not subject)", () => {
    const group = (key: (id: string) => string) =>
      Object.values(
        labels.labels.reduce<Record<string, string[]>>((acc, l) => {
          (acc[key(l.email_id)] ??= []).push(l.email_id);
          return acc;
        }, {}),
      )
        .map((g) => g.sort().join(","))
        .sort();
    expect(group((id) => byId.get(id)!.thread_key)).toEqual(group((id) => labels.labels.find((l) => l.email_id === id)!.thread_key));
  });

  it("every fact quotes its source email exactly", () => {
    const body = new Map(fixture.records.emails.map((e) => [e.email_id, e.body]));
    for (const d of r.decisions) for (const f of d.facts) expect(body.get(f.evidence.email_id)).toContain(f.evidence.quote);
  });

  it("subjects are misleading: E01 says 'Invoice review' but is threaded with the duplicate-ticket emails", () => {
    expect(byId.get("E01")!.subject).toBe("Invoice review");
    expect(byId.get("E01")!.thread_key).toBe(byId.get("E02")!.thread_key);
    expect(byId.get("E02")!.subject).toBe("Pilot incident");
  });
});
