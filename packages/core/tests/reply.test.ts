import { describe, it, expect } from "vitest";
import { runTriage, lintDraft, needsApproval, correctionBurden, TONES } from "../src/index.js";
import fixture from "../../../data/fixture/C16/fixture.json";
import { fixtureWith } from "./helpers.js";

const r = runTriage(fixture);
const thread = (key: string) => r.threads.find((t) => t.thread_key === key)!;
const draft = (key: string) => r.drafts.find((d) => d.thread_key === key)!;

describe("reply tones", () => {
  it("every reply exists in all four tones and every tone passes the lint", () => {
    for (const d of r.drafts) {
      expect(Object.keys(d.tones).sort(), d.thread_key).toEqual(TONES.map((t) => t.id).sort());
      for (const [tone, body] of Object.entries(d.tones)) expect(lintDraft(body!, thread(d.thread_key)).ok, `${d.thread_key}/${tone}`).toBe(true);
    }
  });

  it("standard tone is the default draft", () => {
    for (const d of r.drafts) expect(d.tones.standard).toBe(d.body);
  });

  it("tones change the framing, never the facts: the corrected date and owner are in every tone", () => {
    for (const body of Object.values(draft("T-dup-ticket").tones)) {
      expect(body).toContain("20 October 2026");
      expect(body).toContain("Dev");
      expect(body).not.toMatch(/18 October/);
    }
  });

  it("the E08 acknowledgement never claims the file was received, in any tone", () => {
    for (const body of Object.values(draft("T-test-data").tones)) {
      expect(body).toMatch(/not verified/);
      expect(body).not.toMatch(/received|attached/i);
    }
  });

  it("the brief tone is shorter than the formal one", () => {
    for (const d of r.drafts) expect(d.tones.brief!.length, d.thread_key).toBeLessThanOrEqual(d.tones.formal!.length);
  });

  it("a moved deadline flows into every tone (changed input: due 22 October)", () => {
    const v = runTriage(fixtureWith({ replace: { E02: { body: "Correction: due 22 October. Keep one ticket only." } } }));
    for (const body of Object.values(v.drafts.find((d) => d.thread_key === "T-dup-ticket")!.tones)) expect(body).toContain("22 October 2026");
  });
});

describe("reply target", () => {
  it("each reply answers the right email: the correction for duplicate tickets, the request for missing ids", () => {
    expect(draft("T-dup-ticket").reply_to).toEqual({ email_id: "E02", subject: "Pilot incident" });
    expect(draft("T-missing-ids").reply_to?.email_id).toBe("E06");
    expect(draft("T-test-data").reply_to?.email_id).toBe("E08");
  });
  it("there is no reply to the quarantined email or the do-not-chase thread", () => {
    expect(r.drafts.find((d) => d.thread_key === "QUARANTINE")).toBeUndefined();
    expect(r.drafts.find((d) => d.thread_key === "T-export")).toBeUndefined();
  });
});

describe("approval before a reply leaves the team", () => {
  it("dates, commitments and escalated threads need an Approver", () => {
    expect(needsApproval(draft("T-dup-ticket").body, thread("T-dup-ticket"))).toMatchObject({ needed: true, reasons: ["states a date"] });
    expect(needsApproval(draft("T-missing-ids").body, thread("T-missing-ids")).reasons).toEqual(expect.arrayContaining(["makes a commitment", "the thread is escalated"]));
    expect(needsApproval("Hi,\n\nThanks for confirming.\n\nRegards", thread("T-test-data")).needed).toBe(false);
  });
});

describe("draft correction burden", () => {
  it("0 when sent as suggested, higher the more a person rewrote", () => {
    const s = draft("T-dup-ticket").body;
    expect(correctionBurden(s, s).ratio).toBe(0);
    const light = correctionBurden(s, s.replace("Regards", "Thanks"));
    const heavy = correctionBurden(s, "Hi,\n\nDev has this.\n\nThanks");
    expect(light.ratio).toBeGreaterThan(0);
    expect(light.ratio).toBeLessThan(0.1);
    expect(heavy.ratio).toBeGreaterThan(0.6);
  });
});
