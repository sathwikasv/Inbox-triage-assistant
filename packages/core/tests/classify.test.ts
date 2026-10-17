import { describe, it, expect } from "vitest";
import { classifyPurpose, classifyUrgency } from "../src/classify.js";
import fixture from "../../../data/fixture/C16/fixture.json";
import labels from "../../../data/labels/C16_labels.json";

const body = (id: string) => fixture.records.emails.find((e) => e.email_id === id)!.body;

describe("purpose rules on the starter fixture", () => {
  // E05 is decided by the injection detector, not by these rules.
  const cases = labels.labels.filter((l) => l.purpose !== "injection");
  it.each(cases.map((l) => [l.email_id, l.purpose]))("%s is %s", (id, purpose) => {
    expect(classifyPurpose(body(id)).purpose).toBe(purpose);
  });

  it("'almost done' is progress, not a resolution", () => {
    expect(classifyPurpose("Almost done, still needs validation.").purpose).toBe("status_update");
  });
  it("a resolved blocker is a resolution, not a blocker", () => {
    expect(classifyPurpose("The earlier blocker is resolved.").purpose).toBe("resolution");
  });
  it("'can you send X' is a request, 'can you clarify which X' is a question", () => {
    expect(classifyPurpose("Can you send the stock report?").purpose).toBe("request");
    expect(classifyPurpose("Can you clarify which store?").purpose).toBe("question");
  });
});

describe("urgency rules", () => {
  const at = "2026-10-16T09:00:00+05:30";
  it("request due within 3 days is high, later is medium", () => {
    expect(classifyUrgency({ purpose: "request", text: "", received_at: at, due: "2026-10-18" }).urgency).toBe("high");
    expect(classifyUrgency({ purpose: "request", text: "", received_at: at, due: "2026-10-25" }).urgency).toBe("medium");
  });
  it("request without an owner is high (escalation)", () => {
    expect(classifyUrgency({ purpose: "request", text: "", received_at: at, owner_missing: true }).urgency).toBe("high");
  });
  it("urgent wording does not raise an FYI", () => {
    const r = classifyUrgency({ purpose: "fyi", text: "URGENT: just so you know", received_at: at });
    expect(r.urgency).toBe("low");
    expect(r.why).toMatch(/ignored/);
  });
  it("duplicate sits one level below the original", () => {
    expect(classifyUrgency({ purpose: "duplicate", text: "", received_at: at, original_urgency: "high" }).urgency).toBe("medium");
  });
});
