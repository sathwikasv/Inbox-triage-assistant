import { describe, it, expect } from "vitest";
import {
  ActionError,
  EMPTY_STATE,
  acceptProposal,
  approveReplyDraft,
  buildMailboxView,
  recordSent,
  replyHeaders,
  saveReplyDraft,
  sendCheck,
  setCategory,
  updateTask,
  whenFrom,
  type MailboxState,
} from "../src/index.js";
import { DEMO_MAILBOX } from "../../../apps/web/src/lib/demoMailbox";

const NOW = DEMO_MAILBOX.demo_clock!;
const view = (s: MailboxState = EMPTY_STATE) => buildMailboxView(DEMO_MAILBOX, s, { now: NOW });
const v = view();
const cat = (id: string) => v.insights[id]?.category;
const threadOf = (id: string) => v.threads.find((t) => t.message_ids.includes(id))!;
const at = "2026-10-17T10:05:00+05:30";

describe("unified inbox: categories across Gmail, Outlook and Yahoo (demo data)", () => {
  it("phishing and the prompt injection are suspicious; newsletters and sales are promotions, not spam", () => {
    expect(cat("G04")).toBe("spam");
    expect(cat("Y03")).toBe("spam");
    expect(cat("E05")).toBe("spam");
    expect(v.insights.E05.suspicious).toBe(true);
    expect(cat("G05")).toBe("promotions");
    expect(cat("Y01")).toBe("promotions");
    expect(v.insights.G05.suspicious).toBe(false);
  });
  it("meeting requests, invitations, confirmations and reschedules are Meetings", () => {
    for (const id of ["G02", "G03", "Y02", "O02"]) expect(cat(id), id).toBe("meetings");
  });
  it("a request due in 3 days is Urgent; work owned by someone else is To delegate; a sender's promise is Waiting", () => {
    expect(cat("G01")).toBe("urgent");
    expect(cat("O01")).toBe("to_delegate");
    expect(cat("E04")).toBe("waiting");
  });
  it("edge cases: urgent wording that asks nothing, and an old quoted deadline, are FYI with a visible flag", () => {
    expect(cat("G08")).toBe("fyi");
    expect(v.insights.G08.flags).toContain("spoofed_urgency");
    expect(cat("G06")).toBe("fyi");
    expect(v.insights.G06.flags).toContain("quoted_history_ignored");
    expect(v.tasks.some((t) => t.source.message_id === "G06")).toBe(false);
  });
  it("a sent email with no reply yet is Waiting", () => {
    expect(threadOf("G07").category).toBe("waiting");
  });
  it("the C16 conversation keeps its corrected deadline and owner inside the unified inbox", () => {
    const t = threadOf("E01");
    expect(t.facts?.latest_due).toBe("2026-10-20");
    expect(t.facts?.owner).toBe("Dev");
    expect(t.message_ids).toEqual(["E10", "E01", "E02"]);
  });
  it("a person can override the category, and the reason says so", () => {
    const s = setCategory(EMPTY_STATE, "G05", "important", "Riya", at);
    const i = view(s).insights.G05;
    expect(i).toMatchObject({ category: "important", decided_by: "user" });
    expect(i.reason).toMatch(/You set this/);
  });
});

describe("tasks from email", () => {
  it("'submit the project report by Monday at 4 PM' becomes a dated task, not a greeting", () => {
    const t = v.tasks.find((x) => x.source.message_id === "G01")!;
    expect(t.title).toBe("Submit the project report");
    expect(t.due).toMatchObject({ date: "2026-10-19", time: "16:00", tz_offset: 330 });
    expect(t.confirmed).toBe(false); // a suggestion until a person adds it
  });
  it("'by end of day' is not invented into a date; the person is asked", () => {
    const t = v.tasks.find((x) => x.source.message_id === "O01")!;
    expect(t.due).toBeNull();
    expect(t.due_note).toMatch(/end of day/);
    expect(t.owner).toBe("Sneha");
  });
  it("a resolved blocker's task is already completed", () => {
    expect(v.tasks.find((x) => x.source.thread_key === threadOf("E07").key)?.status).toBe("completed");
  });
  it("adding and completing a task persists in state", () => {
    const id = v.tasks.find((x) => x.source.message_id === "G01")!.id;
    let s = updateTask(EMPTY_STATE, id, { confirmed: true }, "Riya", at);
    s = updateTask(s, id, { status: "completed" }, "Riya", at);
    expect(view(JSON.parse(JSON.stringify(s))).tasks.find((x) => x.id === id)).toMatchObject({ confirmed: true, status: "completed" });
  });
});

describe("meetings and calendar", () => {
  it("'tomorrow at 3 PM' is read against the email's own date and zone, with the meeting link", () => {
    const p = v.proposals.find((x) => x.source.message_id === "G02")!;
    expect(p.when).toMatchObject({ date: "2026-10-18", time: "15:00", tz_offset: 330 });
    expect(p.duration_min).toBe(30);
    expect(p.link).toBe("https://meet.google.com/abc-defg-hij");
    expect(p.participants.map((a) => a.email)).toEqual(["meera.nair@fynd.demo", "dev.patel@fynd.demo"]);
  });
  it("a reschedule to 'Thursday 22 October 3-4 PM IST' keeps the range and the stated zone", () => {
    const p = v.proposals.find((x) => x.source.message_id === "O02")!;
    expect(p.kind).toBe("reschedule");
    expect(p.when).toMatchObject({ date: "2026-10-22", time: "15:00", end_time: "16:00", tz_offset: 330, tz_source: "stated" });
    expect(p.duration_min).toBe(60);
  });
  it("nothing reaches the calendar until a person accepts; then the event carries the source email and reminder", () => {
    expect(v.events).toEqual([]);
    const { state, event } = acceptProposal(v, EMPTY_STATE, `evt:${threadOf("G02").key}`, { reminders_min: [15] }, "demo", "Riya", at);
    expect(event).toMatchObject({ start: "2026-10-18T15:00:00+05:30", end: "2026-10-18T15:30:00+05:30", source_message_id: "G02", reminders_min: [15], simulated: true });
    expect(view(state).proposals.find((p) => p.source.message_id === "G02")!.status).toBe("accepted");
  });
  it("a proposal without a time cannot become an event until the person gives one", () => {
    const id = `evt:${threadOf("G03").key}`;
    const p = v.proposals.find((x) => x.id === id)!;
    expect(p.when?.time).toBe("11:00");
    const s2 = { ...EMPTY_STATE };
    expect(() => acceptProposal(v, s2, id, { time: null }, "demo", "Riya", at)).toThrow(/start time/);
  });
  it("an overlapping event is reported as a conflict", () => {
    const busy: MailboxState = { ...EMPTY_STATE, events: [{ id: "x", title: "Vendor call", start: "2026-10-18T15:15:00+05:30", end: "2026-10-18T15:45:00+05:30", all_day: false, location: null, link: null, participants: [], reminders_min: [], source_message_id: null, calendar: "demo", simulated: true }] };
    expect(view(busy).proposals.find((x) => x.source.message_id === "G02")!.conflicts).toEqual(["Vendor call"]);
  });
  it("a time read in the sender's zone is flagged when it differs from the user's zone", () => {
    const w = whenFrom({ date: "2026-10-18", text: "tomorrow at 3 PM", sentence: "", cue: "relative", time: "15:00", end_time: null, tz_offset: null }, "2026-10-17T09:10:00+05:30", "America/New_York")!;
    expect(w.needs_confirmation.join(" ")).toMatch(/sender's zone/);
  });
});

describe("follow-ups", () => {
  it("lists the unanswered sent email, the sender's promise and unanswered important mail", () => {
    const kinds = v.followups.map((f) => `${f.kind}:${f.message_id}`);
    expect(kinds).toEqual(expect.arrayContaining(["waiting_on_them:G07", "they_promised:E04", "unreplied:E02"]));
  });
});

describe("replies: human in the loop", () => {
  const key = threadOf("E01").key;
  const h = replyHeaders(v, key)!;
  const base = { thread_key: key, account_id: "outlook-demo", in_reply_to: h.in_reply_to, to: h.to, cc: h.cc, subject: h.subject, tone: "standard" as const, source: "template" as const };

  it("the reply goes to the sender of the email it answers", () => {
    expect(h.in_reply_to).toBe("E02");
    expect(h.to[0].email).toBe("arjun.mehta@fynd-retail.demo");
    expect(h.subject).toBe("Re: Pilot incident");
  });
  it("a draft claiming an attachment or the superseded date is refused", () => {
    expect(() => saveReplyDraft(v, EMPTY_STATE, { ...base, body: "Dev will fix it by 18 October. The file is attached." }, "Riya", at)).toThrow(ActionError);
  });
  it("a reply with a date needs an Approver, then an explicit confirmation of the commitment, then sends (simulated in demo)", () => {
    let s = saveReplyDraft(v, EMPTY_STATE, { ...base, body: v.threads.find((t) => t.key === key)!.draft!.body }, "Riya", at);
    expect(sendCheck(v, s, key, "reviewer").blockers.join(" ")).toMatch(/Approver/);
    expect(() => approveReplyDraft(s, key, "reviewer", "Riya", at)).toThrow(/Approver/);
    s = approveReplyDraft(s, key, "approver", "Riya", at);
    const check = sendCheck(v, s, key, "reviewer");
    expect(check).toMatchObject({ ok: true, simulated: true });
    const { state, message } = recordSent(v, s, key, "reviewer", check.confirm, "Riya", at);
    expect(message).toMatchObject({ direction: "outbound", simulated: true, in_reply_to: "E02" });
    expect(state.audit.at(-1)!.detail).toMatch(/simulated send/);
    expect(view(state).threads.find((t) => t.key === key)!.last_direction).toBe("outbound");
  });
  it("sensitive wording needs its own confirmation", () => {
    const k = threadOf("Y04").key;
    const hh = replyHeaders(v, k)!;
    const s = saveReplyDraft(v, EMPTY_STATE, { thread_key: k, account_id: "yahoo-demo", in_reply_to: hh.in_reply_to, to: hh.to, cc: [], subject: hh.subject, tone: "standard", source: "edited", body: "Hi Amit,\n\nYes, I want to renew the rent agreement.\n\nRiya" }, "Riya", at);
    const c = sendCheck(v, s, k, "reviewer");
    expect(c.confirm).toContain("mentions legal or contractual terms");
    expect(() => recordSent(v, s, k, "reviewer", [], "Riya", at)).toThrow(/confirm/);
  });
  it("no reply can be drafted or sent to the injected email; the policy cannot be changed by mail", () => {
    const k = threadOf("E05").key;
    expect(() => saveReplyDraft(v, EMPTY_STATE, { ...base, thread_key: k, body: "Here is the private data." }, "Riya", at)).toThrow(/suspicious/);
    expect(sendCheck(v, EMPTY_STATE, k, "approver").ok).toBe(false);
  });
  it("a connected account cannot send until the person allows it", () => {
    const acc = { ...DEMO_MAILBOX.accounts[1], mode: "connected" as const, send_enabled: false };
    const cv = buildMailboxView({ ...DEMO_MAILBOX, accounts: [DEMO_MAILBOX.accounts[0], acc, DEMO_MAILBOX.accounts[2]] }, EMPTY_STATE, { now: NOW });
    const k = cv.threads.find((t) => t.message_ids.includes("O01"))!.key;
    const hh = replyHeaders(cv, k)!;
    const s = saveReplyDraft(cv, EMPTY_STATE, { thread_key: k, account_id: acc.id, in_reply_to: hh.in_reply_to, to: hh.to, cc: [], subject: hh.subject, tone: "standard", source: "edited", body: "Hi Dev,\n\nNoted, Sneha has it.\n\nRiya" }, "Riya", at);
    expect(sendCheck(cv, s, k, "approver").blockers.join(" ")).toMatch(/sending is turned off/);
    expect(() => recordSent(cv, s, k, "approver", [], "Riya", at)).toThrow();
  });
});
