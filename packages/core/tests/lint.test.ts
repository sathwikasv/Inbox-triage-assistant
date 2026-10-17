import { describe, it, expect } from "vitest";
import { runTriage, lintDraft } from "../src/index.js";
import fixture from "../../../data/fixture/C16/fixture.json";
import labels from "../../../data/labels/C16_labels.json";

const r = runTriage(fixture);
const threadOf = (id: string) => r.threads.find((t) => t.thread_key === r.decisions.find((d) => d.email_id === id)!.thread_key)!;
const draftOf = (id: string) => r.drafts.find((d) => d.thread_key === threadOf(id).thread_key);

describe("generated drafts (Check 2)", () => {
  it("every generated draft passes the lint", () => {
    for (const d of r.drafts) expect(d, d.thread_key).toMatchObject({ lint_ok: true, violations: [] });
  });

  it("no generated draft contains a forbidden term from the labels file", () => {
    for (const d of r.drafts) for (const term of labels.forbidden_draft_terms) expect(d.body.toLowerCase()).not.toContain(term);
  });

  it("no draft for the quarantined email or the resolved export (do not chase)", () => {
    expect(draftOf("E05")).toBeUndefined();
    expect(draftOf("E03")).toBeUndefined();
  });

  it("duplicate-ticket draft uses the corrected date and owner only", () => {
    const d = draftOf("E01")!;
    expect(d.body).toContain("Dev");
    expect(d.body).toContain("20 October 2026");
    expect(d.body).not.toMatch(/18 October/);
  });

  it("missing-IDs draft asks for an owner and references the existing ticket", () => {
    const d = draftOf("E06")!;
    expect(d.body).toMatch(/who should own/);
    expect(d.body).toContain("ABC-101");
  });

  it("E08 acknowledgement does not claim the file was received", () => {
    const d = draftOf("E08")!;
    expect(d.body).not.toMatch(/attach|received the file/i);
  });
});

describe("lint on reviewer edits", () => {
  it("rejects claiming the attachment in the E08 thread", () => {
    const v = lintDraft("Thanks, we have received the attached file.", threadOf("E08"));
    expect(v.ok).toBe(false);
    expect(v.violations.map((x) => x.reason)).toEqual([expect.stringMatching(/claims an attachment/), expect.stringMatching(/received or checked a file/)]);
  });

  it("rejects the superseded 18 October deadline and names the correction", () => {
    const v = lintDraft("Dev will have it done, due 18 October.", threadOf("E01"));
    expect(v.ok).toBe(false);
    expect(v.violations[0].reason).toMatch(/superseded by E02/);
  });

  it("accepts the corrected 20 October deadline", () => {
    expect(lintDraft("Dev has it, due 20 October 2026.", threadOf("E01")).ok).toBe(true);
  });

  it("rejects payment, approval and sending claims", () => {
    const v = lintDraft("Payment is approved and we have sent the refund.", threadOf("E09"));
    expect(v.violations.map((x) => x.term.toLowerCase())).toEqual(expect.arrayContaining(["payment", "approved", "we have sent"]));
  });

  it("rejects a delivery promise and relative dates", () => {
    expect(lintDraft("We will fix it by Friday.", threadOf("E01")).ok).toBe(false);
    expect(lintDraft("We will reply tomorrow.", threadOf("E09")).ok).toBe(false);
  });

  it("accepts a plain clarification reply", () => {
    expect(lintDraft("Thanks. Which store do you mean, and for which month?", threadOf("E09")).ok).toBe(true);
  });
});
