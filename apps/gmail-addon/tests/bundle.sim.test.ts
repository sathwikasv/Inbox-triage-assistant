import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import fixture from "../../../data/fixture/C16/fixture.json";
import labels from "../../../data/labels/C16_labels.json";

// Runs the real bundle (dist/Code.js) in a sandbox that only has fake Apps Script services,
// like Google's runtime: no require, no Node APIs. Rules only (no AI key).

type Msg = { id: string; thread: string; from: string; subject: string; body: string; date: Date; headers?: Record<string, string> };
const ME = "ops.reviewer@acme-retail.example";
const SENDER: Record<string, string> = {
  "T-dup-ticket": "Priya Sharma (Store Ops) <priya.ops@acme-retail.example>",
  "T-export": "Data Team <data@acme-retail.example>",
  "T-missing-ids": "Rahul Verma (Pilot PM) <rahul.pm@acme-retail.example>",
  "T-catalogue": "Meera Iyer (Catalogue) <meera.catalogue@acme-retail.example>",
  "T-test-data": "Rahul Verma (Pilot PM) <rahul.pm@acme-retail.example>",
  "T-clarify": "Finance Analytics <analytics@acme-retail.example>",
  QUARANTINE: "IT Admin <it.admin.helpdesk@mailbox.example>",
};

function sandbox(messages: Msg[]) {
  const props = new Map<string, string>();
  const store = { getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => props.set(k, v) };
  const labelsOn = new Map<string, Set<string>>(); // label → thread ids
  const drafts: { thread: string; body: string }[] = [];
  const starred = new Set<string>();
  const thread = (id: string) => ({ getId: () => id, getMessages: () => messages.filter((m) => m.thread === id).sort((a, b) => +a.date - +b.date).map(message), getFirstMessageSubject: () => "" });
  const message = (m: Msg) => ({
    getId: () => m.id,
    getThread: () => thread(m.thread),
    getFrom: () => m.from,
    getDate: () => m.date,
    getSubject: () => m.subject,
    getPlainBody: () => m.body,
    getBody: () => m.body,
    getReplyTo: () => "",
    getHeader: (h: string) => m.headers?.[h] ?? "",
    createDraftReply: (body: string) => {
      drafts.push({ thread: m.thread, body });
      return { getId: () => `d${drafts.length}` };
    },
    star: () => starred.add(m.id),
  });
  const label = (name: string) => ({
    addToThread: (t: { getId(): string }) => (labelsOn.get(name) ?? labelsOn.set(name, new Set()).get(name)!).add(t.getId()),
    removeFromThread: (t: { getId(): string }) => labelsOn.get(name)?.delete(t.getId()),
  });
  const pad = (n: number) => String(n).padStart(2, "0");
  // Card Service fake: every builder call chains; build() returns a plain object.
  const chain: unknown = new Proxy(function () {}, { get: (_t, p) => (p === "build" ? () => ({ built: true }) : chain), apply: () => chain });
  const ctx = {
    console,
    CardService: chain,
    GmailApp: {
      getMessageById: (id: string) => message(messages.find((m) => m.id === id)!),
      search: () => [],
      getUserLabelByName: (n: string) => label(n),
      createLabel: (n: string) => label(n),
      getDraft: () => ({ deleteDraft: () => undefined }),
    },
    Gmail: { Users: { Labels: { list: () => ({ labels: [] }), create: () => ({}) } } },
    Session: { getEffectiveUser: () => ({ getEmail: () => ME }), getScriptTimeZone: () => "Asia/Kolkata" },
    Utilities: {
      formatDate: (d: Date) => {
        const t = new Date(d.getTime() + 330 * 60_000); // IST
        return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}+05:30`;
      },
    },
    PropertiesService: { getScriptProperties: () => store, getUserProperties: () => store },
    CacheService: { getUserCache: () => null },
    SpreadsheetApp: { create: () => ({ getId: () => "s1", getSheets: () => [{ appendRow: () => undefined }] }), openById: () => ({ getSheets: () => [{ appendRow: () => undefined }] }) },
    UrlFetchApp: { fetch: () => { throw new Error("no network in the sandbox"); } },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("../dist/Code.js", import.meta.url), "utf8"), ctx);
  return { ctx: ctx as typeof ctx & { TD: Record<string, (...a: unknown[]) => unknown> }, labelsOn, drafts, starred };
}

const bundleBuilt = existsSync(new URL("../dist/Code.js", import.meta.url));

describe.skipIf(!bundleBuilt)("Apps Script bundle in a sandbox (rules only)", () => {
  const msgs: Msg[] = [];
  beforeAll(() => {
    const byKey = new Map(labels.labels.map((l) => [l.email_id, l.thread_key]));
    for (const e of fixture.records.emails) msgs.push({ id: e.email_id, thread: byKey.get(e.email_id)!, from: SENDER[byKey.get(e.email_id)!], subject: e.subject, body: e.body, date: new Date(e.received_at) });
    const now = Date.now();
    const extra = (id: string, from: string, subject: string, body: string, headers?: Record<string, string>) => msgs.push({ id, thread: id, from, subject, body, date: new Date(now - 3_600_000), headers });
    extra("X-phish", "PayPaI Security <security-alert@paypa1-verify.example>", "URGENT: Your account will be suspended", "Click here to verify your account and confirm your password within 24 hours.", { "Authentication-Results": "spf=fail dkim=fail" });
    extra("X-promo", "MegaMart Deals <offers@megamart-deals.example>", "IMPORTANT!!! 70% off ends tonight", "Our biggest sale of the season is live. Don't miss out!", { "List-Unsubscribe": "<mailto:u@megamart-deals.example>" });
    extra("X-hr", "HR Team <hr@acme-retail.example>", "Your salary revision letter", "Details of your salary revision and appraisal outcome are below.");
    extra("X-otp", "Bank Alerts <alerts@yourbank.example>", "OTP for your transaction", "Your one-time password is 482913. Do not share it.");
    extra("X-cto", "Anita Rao (CTO) <anita.cto@acme-retail.example>", "Checkout is down in production", "Checkout has been failing for all stores. Please investigate immediately and send me an update within the hour.");
    extra("X-deck", "Sneha (Partnerships) <sneha.partners@acme-retail.example>", "Q4 vendor review deck", "Could you prepare the Q4 vendor review slides? We present them on 30 October.");
  });

  const triage = (id: string) => {
    const s = sandbox(msgs);
    // triageMessage is internal; drive it through the scan-free path the card uses.
    const card = s.ctx.TD.onGmailMessage({ gmail: { messageId: id } });
    const props = s.ctx.PropertiesService.getUserProperties().getProperty(`rec:${id}`);
    return { rec: JSON.parse(props!), card, ...s };
  };

  it.each([
    ["E02", "delegate"], // correction to Dev's task: urgent, Dev owns it
    ["E06", "do_now"], // missing order IDs: urgent and nobody owns it
    ["E05", "review"], // prompt injection
    ["E08", "fyi"], // blocker resolved
    ["E03", "fyi"], // export done, do not chase
    ["E04", "schedule"], // sender's own commitment: watch
    ["E09", "schedule"], // question, not urgent
    ["X-phish", "review"],
    ["X-promo", "fyi"],
    ["X-hr", "review"],
    ["X-otp", "review"],
    ["X-cto", "do_now"],
    ["X-deck", "schedule"],
  ])("%s → %s", (id, bucket) => {
    expect(triage(id).rec.bucket).toBe(bucket);
  });

  it("the E02 record carries the corrected deadline and the owner from the rules", () => {
    const { rec } = triage("E02");
    expect(rec.facts.map((f: { kind: string; value: string }) => `${f.kind}=${f.value}`)).toEqual(expect.arrayContaining(["due=2026-10-20"]));
    expect(rec.owner).toBe("Dev");
  });

  it("fake urgency in a promotion is flagged and not treated as urgent", () => {
    const { rec } = triage("X-promo");
    expect(rec).toMatchObject({ type: "promotion", spoofedUrgency: true, urgency: "low" });
  });

  it("labels are applied and Do now / Human review are starred", () => {
    const s = triage("X-cto");
    expect(s.labelsOn.get("Triage/1 Do now")?.has("X-cto")).toBe(true);
    expect(s.starred.has("X-cto")).toBe(true);
  });

  it("drafts: written for an action thread, never for human-review mail", () => {
    const s = sandbox(msgs);
    s.ctx.TD.onDraft({ parameters: { messageId: "E09" } });
    s.ctx.TD.onDraft({ parameters: { messageId: "X-otp" } });
    expect(s.drafts.map((d) => d.thread)).toEqual(["T-clarify"]);
    expect(s.drafts[0].body).toMatch(/store and time period/);
  });
});
