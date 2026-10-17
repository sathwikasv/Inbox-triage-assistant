import { describe, expect, it } from "vitest";
import { buildMailboxView, extractDates, replyHeaders, type MailAccount, type MailMessage } from "../src/index.js";

// Real mailboxes are mostly automated mail. Shapes taken from a connected Gmail inbox (content shortened).
const acc: MailAccount = { id: "gm", provider: "gmail", address: "me@gmail.com", display_name: "me", mode: "connected", status: "ok", last_sync_at: null, send_enabled: false };
let n = 0;
const msg = (p: Partial<MailMessage> & Pick<MailMessage, "from" | "subject" | "body">): MailMessage => ({
  id: `m${++n}`,
  account_id: "gm",
  thread_id: `t${n}`,
  to: [{ email: "me@gmail.com" }],
  cc: [],
  received_at: "2026-10-03T10:55:00+05:30",
  direction: "inbound",
  read: false,
  starred: false,
  attachments: [],
  ...p,
});
const view = (messages: MailMessage[], aiCategories = {}) =>
  buildMailboxView({ user: { name: "Riya", addresses: ["me@gmail.com"], timezone: "Asia/Kolkata" }, accounts: [acc], messages }, undefined, { now: "2026-10-18T10:00:00+05:30", aiCategories });

const aws = msg({
  from: { name: "Amazon Web Services", email: "no-reply@amazonaws.com" },
  subject: "Your Request For Accessing AWS Resources Has Been Validated",
  body: "Dear AWS Customer,\n\nYou recently requested Amazon Elastic Compute Cloud (EC2) in Europe (Stockholm) Region(s) that required additional validation. Your request has now been validated.\n\nStarting September 2026, this notification will be routed through AWS User Notifications and will be sent from one of five new @aws.com addresses instead of no-reply@amazonaws.com.\n\nAction required: If you have email filters or allowlists for @amazonaws.com, please add @aws.com to ensure continued delivery.",
  received_at: "2026-09-24T10:55:00+05:30",
});
const security = msg({ from: { name: "Google", email: "no-reply@accounts.google.com" }, subject: "Critical security alert", body: "Some of your saved passwords were found in a data breach. Change them now to secure your account." });
const shared = msg({ from: { name: "Google", email: "no-reply@accounts.google.com" }, subject: "You shared some Google Account data with Vercel", body: "Keep track of your Google Account data. You gave Vercel access to some of your Google Account data." });
const promo = msg({ from: { name: "HackerRank Team", email: "support@hackerrank.com" }, subject: "Prepare for your next interview with HackerRank Mock Interviews", body: "Book a mock interview session with an AI interviewer and get feedback.", labels: ["CATEGORY_PROMOTIONS", "UNREAD"] });
const update = msg({ from: { name: "Shiprocket", email: "orders@shiprocket.in" }, subject: "Your order has shipped", body: "Your order #4521 is on its way.", labels: ["CATEGORY_UPDATES"] });
const human = msg({ from: { name: "Karan Desai", email: "karan.desai@gmail.com" }, subject: "Q3 numbers", body: "Hi, could you send me the final Q3 budget numbers by Friday?" });
const fakeMeeting = msg({ from: { name: "Webinars", email: "noreply@events.example.com" }, subject: "Let's meet at our launch webinar", body: "Can we meet you at our launch? Book a session now." });

describe("real mail: automated senders", () => {
  const v = view([aws, security, shared, promo, update, human, fakeMeeting]);
  const ins = (m: MailMessage) => v.insights[m.id];

  it("a no-reply service notice is FYI, not Urgent, with no invented deadline correction or task", () => {
    expect(ins(aws).category).toBe("fyi");
    expect(ins(aws).priority).toBe("low");
    expect(ins(aws).automated).toBe(true);
    expect(ins(aws).reason).toMatch(/no-reply address at amazonaws\.com/);
    expect(v.tasks.some((t) => t.source.message_id === aws.id)).toBe(false);
    expect(v.followups.some((f) => f.message_id === aws.id)).toBe(false);
  });

  it("there is no reply draft for a no-reply sender", () => {
    const th = v.threads.find((t) => t.message_ids.includes(aws.id))!;
    expect(replyHeaders(v, th.key, acc)).toBeNull();
  });

  it("account and security notices are Important, never spam and never a reply chore", () => {
    for (const m of [security, shared]) {
      expect(ins(m).category).toBe("important");
      expect(ins(m).suspicious).toBe(false);
    }
    expect(v.followups.some((f) => f.message_id === security.id)).toBe(false);
  });

  it("Gmail's own Promotions and Updates labels are respected", () => {
    expect(ins(promo).category).toBe("promotions");
    expect(ins(update).category).toBe("fyi");
  });

  it("a human request still needs action", () => {
    expect(ins(human).category).toBe("requires_action");
    expect(ins(human).automated).toBe(false);
  });

  it("marketing that says 'can we meet' is not a meeting request", () => {
    expect(ins(fakeMeeting).category).not.toBe("meetings");
    expect(v.proposals.some((p) => p.source.message_id === fakeMeeting.id)).toBe(false);
  });
});

describe("dates", () => {
  it("a month on its own ('Starting September 2026') is not a date", () => {
    expect(extractDates("Starting September 2026, this notification will be routed through AWS.", "2026-09-24T10:55:00+05:30")).toEqual([]);
    expect(extractDates("Please send it by 20 September 2026.", "2026-09-14T10:00:00+05:30").map((d) => d.date)).toEqual(["2026-09-20"]);
  });
});

describe("the AI assistant's category opinion", () => {
  it("can correct the rules, and says so", () => {
    const v = view([update], { [update.id]: { category: "requires_action", reason: "the courier needs a delivery address" } });
    expect(v.insights[update.id].category).toBe("requires_action");
    expect(v.insights[update.id].decided_by).toBe("ai");
    expect(v.insights[update.id].reason).toMatch(/AI assistant read the conversation/);
  });

  it("can never take phishing out of quarantine, or put mail into it", () => {
    const phish = msg({ from: { name: "Google Security", email: "alert@g00gle-verify.example" }, subject: "Verify your account", body: "Verify your account password within 24 hours or your account will be suspended. http://g00gle-verify.example/login" });
    const v = view([phish, human], { [phish.id]: { category: "fyi", reason: "harmless" }, [human.id]: { category: "spam", reason: "looks odd" } });
    expect(v.insights[phish.id].category).toBe("spam");
    expect(v.insights[phish.id].suspicious).toBe(true);
    expect(v.insights[human.id].category).toBe("requires_action");
  });

  it("a person's own choice still wins", () => {
    const v = buildMailboxView(
      { user: { name: "Riya", addresses: ["me@gmail.com"], timezone: "Asia/Kolkata" }, accounts: [acc], messages: [update] },
      { categories: { [update.id]: "important" }, read: {}, starred: {}, archived: {}, tasks: {}, manual_tasks: [], proposals: {}, events: [], followups: {}, reminders: [], drafts: {}, outbox: [], audit: [] },
      { now: "2026-10-18T10:00:00+05:30", aiCategories: { [update.id]: { category: "requires_action", reason: "x" } } },
    );
    expect(v.insights[update.id].category).toBe("important");
    expect(v.insights[update.id].decided_by).toBe("user");
  });
});
