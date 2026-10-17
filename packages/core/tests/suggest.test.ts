import { describe, it, expect } from "vitest";
import { runTriage, suggestFixes, lintDraft } from "../src/index.js";
import fixture from "../../../data/fixture/C16/fixture.json";

const r = runTriage(fixture);
const threadOf = (id: string) => r.threads.find((t) => t.thread_key === r.decisions.find((d) => d.email_id === id)!.thread_key)!;

describe("draft suggestions (Accept / Dismiss)", () => {
  it("replaces the superseded 18 October with the agreed date, and the result lints clean", () => {
    const t = threadOf("E01");
    const body = "Hi, Dev will fix it by 18 October. Regards";
    const s = suggestFixes(body, t).find((x) => x.title === "Use the agreed date")!;
    expect(s).toMatchObject({ before: "18 October", after: "20 October 2026" });
    const fixed = s.apply(body);
    expect(fixed).toContain("20 October 2026");
    expect(lintDraft(fixed, t).violations.filter((v) => /superseded/.test(v.reason))).toEqual([]);
  });

  it("rewrites a confirmed attachment honestly in the E08 thread", () => {
    const t = threadOf("E08");
    const body = "Thanks for confirming. We have received the attached file. Regards";
    const s = suggestFixes(body, t).find((x) => x.id === "claim-attachment")!;
    expect(s.after).toBe("You mentioned a file; it is not verified on our side yet.");
    const fixed = s.apply(body);
    expect(lintDraft(fixed, t).ok).toBe(true);
  });

  it("removes payment and approval claims", () => {
    const t = threadOf("E09");
    const body = "Thanks for asking. Payment is approved. We are confirming the details.";
    let b = body;
    for (const s of suggestFixes(body, t).filter((x) => x.kind === "fix")) b = s.apply(b);
    expect(lintDraft(b, t).ok).toBe(true);
    expect(b).toContain("We are confirming the details.");
  });

  it("suggests citing ABC-101 and asking for an owner when the draft leaves them out", () => {
    const ids = suggestFixes("Hi,\n\nThanks for flagging this.\n\nRegards", threadOf("E06")).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["ref-ABC-101", "ask-owner"]));
  });

  it("the generated drafts need no fixes", () => {
    for (const d of r.drafts) {
      const t = r.threads.find((x) => x.thread_key === d.thread_key)!;
      expect(suggestFixes(d.body, t).filter((s) => s.kind === "fix"), d.thread_key).toEqual([]);
    }
  });
});
