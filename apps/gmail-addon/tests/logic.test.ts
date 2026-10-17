import { describe, it, expect } from "vitest";
import { cleanBody, combineType, decideBucket, detectSensitive, trustScore, type SenderSignals } from "../src/logic.js";

const base: SenderSignals = { fromName: "Dev Rao", fromEmail: "dev@acme-retail.example", priorMessages: 6, userReplied: 2, subject: "Duplicate tickets", body: "Please fix duplicate ticket creation. Due 18 October.", links: 0, hasAsk: true };

describe("sensitive content goes to a person", () => {
  it.each([
    ["Your OTP is 482913, do not share it.", true],
    ["Please update my bank account number and IFSC for the refund.", true],
    ["Attaching my PAN card ABCDE1234F for verification.", true],
    ["Can we discuss my salary revision and appraisal?", true],
    ["We received a legal notice from the landlord.", true],
    ["Please fix duplicate ticket creation.", false],
  ])("%s → %s", (text, sensitive) => {
    expect(detectSensitive(text as string).sensitive).toBe(sensitive);
  });
});

describe("sender trust score", () => {
  it("a known colleague with passing auth is trusted", () => {
    expect(trustScore({ ...base, authResults: "spf=pass dkim=pass" }).score).toBeGreaterThanOrEqual(80);
  });
  it("a 'CEO' on free mail asking for gift cards is not", () => {
    const t = trustScore({ ...base, fromName: "CEO Office", fromEmail: "ceo.office.urgent@gmail.com", priorMessages: 0, userReplied: 0, subject: "URGENT request", body: "Buy 5 gift cards and send me the codes now.", hasAsk: true });
    expect(t.score).toBeLessThan(35);
  });
  it("failed DKIM and a credential ask drop the score hard", () => {
    const t = trustScore({ ...base, authResults: "spf=fail dkim=fail", priorMessages: 0, userReplied: 0, subject: "Account locked", body: "Click here to verify your account.", links: 5 });
    expect(t.score).toBeLessThan(20);
  });
  it("'IMPORTANT' in the subject with no real ask is spoofed urgency", () => {
    const t = trustScore({ ...base, subject: "IMPORTANT!!! Read now", body: "Our autumn catalogue is out, have a look.", hasAsk: false, priorMessages: 0, userReplied: 0 });
    expect(t.spoofedUrgency).toBe(true);
  });
});

describe("priority bucket", () => {
  const b = { type: "request" as const, urgency: "high" as const, importance: "high" as const, actionNeeded: true, sensitive: false, trust: 80, confidence: 0.9, me: "Sai" };
  it("urgent + important + mine → Do now", () => expect(decideBucket(b).bucket).toBe("do_now"));
  it("urgent + owned by someone else → Delegate", () => expect(decideBucket({ ...b, owner: "Dev" })).toMatchObject({ bucket: "delegate", reason: /Dev owns it/ }));
  it("important, not urgent → Schedule", () => expect(decideBucket({ ...b, urgency: "medium", dueInDays: 9 }).bucket).toBe("schedule"));
  it("FYI and resolutions → FYI", () => {
    expect(decideBucket({ ...b, type: "fyi", actionNeeded: false }).bucket).toBe("fyi");
    expect(decideBucket({ ...b, type: "resolution", actionNeeded: false }).bucket).toBe("fyi");
  });
  it("sensitive, injection, low trust and low confidence → Human review", () => {
    expect(decideBucket({ ...b, sensitive: true }).bucket).toBe("review");
    expect(decideBucket({ ...b, type: "injection" }).bucket).toBe("review");
    expect(decideBucket({ ...b, trust: 20 }).bucket).toBe("review");
    expect(decideBucket({ ...b, confidence: 0.4 }).bucket).toBe("review");
  });
  it("a sender commitment is scheduled to watch", () => expect(decideBucket({ ...b, type: "commitment", actionNeeded: false }).bucket).toBe("schedule"));
});

describe("rules + AI type", () => {
  it("agreement raises confidence", () => expect(combineType({ type: "request", fallback: false }, { type: "request", confidence: 0.8 })).toMatchObject({ type: "request", agreement: "both" }));
  it("no rule matched: the AI decides", () => expect(combineType({ type: "fyi", fallback: true }, { type: "resolution", confidence: 0.9 })).toMatchObject({ type: "resolution", agreement: "ai" }));
  it("disagreement with an unsure AI keeps the rule and lowers confidence", () => expect(combineType({ type: "request", fallback: false }, { type: "fyi", confidence: 0.6 })).toMatchObject({ type: "request", confidence: 0.5 }));
  it("rules-detected injection is never released", () => expect(combineType({ type: "injection", fallback: false }, { type: "request", confidence: 0.99 }).type).toBe("injection"));
});

describe("cleanBody", () => {
  it("drops quoted history and signatures", () => {
    expect(cleanBody("Thanks, done.\n\nOn Mon, Dev wrote:\n> old text\n")).toBe("Thanks, done.");
    expect(cleanBody("See below.\n> quoted\nMore.\n-- \nDev Rao\nAcme")).toBe("See below.\nMore.");
  });
});
