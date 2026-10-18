import type { CalendarEvent, MailAccount, MailboxData, MailMessage } from "@c16/core";
import starter from "../../../../data/fixture/C16/fixture.json";

// DEMO MODE: fictional accounts and emails. Nothing here came from a real mailbox.

export const DEMO_ACCOUNTS: MailAccount[] = [
  { id: "gmail-demo", provider: "gmail", address: "riya.ops@gmail.demo", display_name: "Riya (Gmail demo)", mode: "demo", company: "Fynd Ops", status: "ok", last_sync_at: "2026-10-17T09:55:00+05:30", send_enabled: false },
  { id: "outlook-demo", provider: "outlook", address: "ops-team@fynd-retail.demo", display_name: "Ops team (demo)", mode: "demo", company: "Fynd Retail", status: "ok", last_sync_at: "2026-10-17T09:55:00+05:30", send_enabled: false },
  { id: "yahoo-demo", provider: "yahoo", address: "riya.personal@yahoo.demo", display_name: "Personal (Yahoo demo)", mode: "demo", company: "Personal", status: "ok", last_sync_at: "2026-10-17T09:50:00+05:30", send_enabled: false },
];

const me = { name: "Riya Sharma", email: "riya.ops@gmail.demo" };
const ops = { name: "Ops team", email: "ops-team@fynd-retail.demo" };
const personal = { name: "Riya Sharma", email: "riya.personal@yahoo.demo" };

type Seed = Omit<MailMessage, "direction" | "read" | "starred" | "attachments" | "cc"> & Partial<Pick<MailMessage, "direction" | "read" | "starred" | "attachments" | "cc">>;
const msg = (m: Seed): MailMessage => ({ direction: "inbound", read: false, starred: false, attachments: [], cc: [], ...m });

// The 12 C16 fixture emails land in the Fynd Retail ops inbox (threaded by content, as judged). The fixture has
// no senders, so the demo gives them fictional colleagues; text and timestamps are unchanged.
const C16_SENDERS: Record<string, { name: string; email: string }> = {
  E01: { name: "Arjun Mehta", email: "arjun.mehta@fynd-retail.demo" },
  E02: { name: "Arjun Mehta", email: "arjun.mehta@fynd-retail.demo" },
  E03: { name: "Kavya Iyer", email: "kavya.iyer@fynd-retail.demo" },
  E04: { name: "Neha Gupta", email: "neha.gupta@fynd-retail.demo" },
  E05: { name: "IT Admin", email: "it-admin@fynd-helpdesk.demo" },
  E06: { name: "Rahul Verma", email: "rahul.verma@fynd-retail.demo" },
  E07: { name: "Sana Khan", email: "sana.khan@fynd-retail.demo" },
  E08: { name: "Sana Khan", email: "sana.khan@fynd-retail.demo" },
  E09: { name: "Vikram Rao", email: "vikram.rao@fynd-retail.demo" },
  E10: { name: "Arjun Mehta", email: "arjun.mehta@fynd-retail.demo" },
  E11: { name: "Kavya Iyer", email: "kavya.iyer@fynd-retail.demo" },
  E12: { name: "Rahul Verma", email: "rahul.verma@fynd-retail.demo" },
};
const c16: MailMessage[] = starter.records.emails.map((e) =>
  msg({ id: e.email_id, account_id: "outlook-demo", from: C16_SENDERS[e.email_id], to: [ops], subject: e.subject, body: e.body, received_at: e.received_at, read: ["E03", "E11", "E12"].includes(e.email_id) }),
);

const gmail: MailMessage[] = [
  msg({ id: "G01", account_id: "gmail-demo", thread_id: "g-report", from: { name: "Prof. Anand Kulkarni", email: "anand.k@nmims.demo" }, to: [me], subject: "Project report submission", body: "Hi Riya,\n\nPlease submit the project report by Monday at 4 PM.\n\nThanks,\nAnand", received_at: "2026-10-16T11:20:00+05:30", starred: true }),
  msg({ id: "G02", account_id: "gmail-demo", thread_id: "g-sync", from: { name: "Meera Nair", email: "meera.nair@fynd.demo" }, to: [me], cc: [{ name: "Dev Patel", email: "dev.patel@fynd.demo" }], subject: "Quick sync on the pilot", body: "Hi Riya,\n\nCan we schedule a meeting tomorrow at 3 PM to go over the pilot numbers? 30 minutes should be enough.\nhttps://meet.google.com/abc-defg-hij\n\nMeera", received_at: "2026-10-17T09:10:00+05:30" }),
  msg({ id: "G03", account_id: "gmail-demo", thread_id: "g-invite", from: { name: "Fynd Calendar", email: "calendar@fynd.demo" }, to: [me], subject: "Invitation: Weekly ops review", body: "You are invited to Weekly ops review on Monday 19 October at 11:00 AM. Location: Boardroom 2, 4th floor.", received_at: "2026-10-16T18:00:00+05:30", attachments: [{ name: "invite.ics", size_kb: 2 }] }),
  msg({ id: "G04", account_id: "gmail-demo", thread_id: "g-security", from: { name: "Google Security Team", email: "no-reply@g00gle-security.demo" }, to: [me], subject: "Action required: your account will be suspended", body: "We noticed unusual activity. Verify your account password within 24 hours or your account will be suspended.\nhttp://g00gle-verify-account.demo/login", received_at: "2026-10-17T07:45:00+05:30" }),
  msg({ id: "G05", account_id: "gmail-demo", thread_id: "g-news", from: { name: "Product Hunt Daily", email: "newsletter@producthunt.demo" }, to: [me], subject: "Top 5 AI tools this week", body: "This week's top launches: inbox assistants, calendar copilots and more.\nManage your preferences or unsubscribe at any time.", received_at: "2026-10-17T06:30:00+05:30", list_unsubscribe: true, read: true }),
  msg({ id: "G06", account_id: "gmail-demo", thread_id: "g-vendor", from: { name: "Priya Shah", email: "priya.shah@vendorco.demo" }, to: [me], subject: "Vendor list for review", body: "Sharing the updated vendor list for your records.\n\n> On 2 October, Ravi wrote:\n> Please send the payout statement by 5 October.", received_at: "2026-10-16T15:40:00+05:30", attachments: [{ name: "vendors.xlsx", size_kb: 48 }] }),
  msg({ id: "G07", account_id: "gmail-demo", thread_id: "g-budget", direction: "outbound", read: true, from: me, to: [{ name: "Karan Desai", email: "karan.desai@finance.demo" }], subject: "Q3 budget numbers", body: "Hi Karan,\n\nCould you share the final Q3 budget numbers for the pilot?\n\nThanks,\nRiya", received_at: "2026-10-14T10:00:00+05:30" }),
  msg({ id: "G08", account_id: "gmail-demo", thread_id: "g-office", from: { name: "Admin Desk", email: "admin@fynd.demo" }, to: [me], subject: "Office address change", body: "URGENT!!! Our new office address is 4th floor, Cyber Towers. No action needed.", received_at: "2026-10-16T17:30:00+05:30", read: true }),
];

const outlookExtra: MailMessage[] = [
  msg({ id: "O01", account_id: "outlook-demo", thread_id: "o-handover", from: { name: "Dev Patel", email: "dev.patel@fynd-retail.demo" }, to: [ops], subject: "Store handover checklist", body: "Please update the store handover checklist for the two new Hyderabad stores by end of day. Owner: Sneha.", received_at: "2026-10-17T08:40:00+05:30" }),
  msg({ id: "O02", account_id: "outlook-demo", thread_id: "o-review", from: { name: "Meera Nair", email: "meera.nair@fynd-retail.demo" }, to: [ops], subject: "Move the vendor review", body: "Can we reschedule the vendor review meeting to Thursday 22 October 3-4 PM IST?", received_at: "2026-10-17T09:30:00+05:30" }),
];

const yahoo: MailMessage[] = [
  msg({ id: "Y01", account_id: "yahoo-demo", thread_id: "y-sale", from: { name: "Myntra", email: "offers@myntra.demo" }, to: [personal], subject: "Big Fashion Sale: up to 60% off", body: "Shop now: 60% off on festive wear. Use code FEST60. Limited-time offer.\nUnsubscribe", received_at: "2026-10-17T08:00:00+05:30", list_unsubscribe: true }),
  msg({ id: "Y02", account_id: "yahoo-demo", thread_id: "y-dentist", from: { name: "Smile Dental Clinic", email: "appointments@smiledental.demo" }, to: [personal], subject: "Appointment confirmed", body: "Your appointment is confirmed for Saturday 24 October at 10:30 AM. Location: Smile Dental, Banjara Hills.", received_at: "2026-10-16T19:15:00+05:30", read: true }),
  msg({ id: "Y03", account_id: "yahoo-demo", thread_id: "y-prize", from: { name: "Lucky Draw", email: "winner@claim-prize.demo" }, to: [personal], subject: "You have won ₹50,000!", body: "Congratulations, you have won the festive lottery. Claim your prize by sharing your bank account details.", received_at: "2026-10-17T05:10:00+05:30" }),
  msg({ id: "Y04", account_id: "yahoo-demo", thread_id: "y-rent", from: { name: "Amit (landlord)", email: "amit.rent@yahoo.demo" }, to: [personal], subject: "Rent agreement renewal", body: "Hi Riya, could you confirm whether you want to renew the rent agreement for another year?", received_at: "2026-10-15T20:00:00+05:30" }),
];

export const DEMO_MAILBOX: MailboxData = {
  user: { name: "Riya Sharma", addresses: [me.email, ops.email, personal.email], timezone: "Asia/Kolkata" },
  accounts: DEMO_ACCOUNTS,
  messages: [...c16, ...outlookExtra, ...gmail, ...yahoo],
  demo_clock: "2026-10-17T10:00:00+05:30",
};

/** Demo calendar: fictional events, labelled as demo wherever they appear. */
const ev = (id: string, title: string, start: string, end: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({ id: `demo-cal:${id}`, title, start, end, all_day: false, location: null, link: null, participants: [], reminders_min: [10], source_message_id: null, calendar: "demo", simulated: true, ...extra });
export const DEMO_EVENTS: CalendarEvent[] = [
  ev("standup", "Ops stand-up", "2026-10-17T10:30:00+05:30", "2026-10-17T10:45:00+05:30", { location: "Teams" }),
  ev("vendor-call", "Vendor call: Sunrise Traders", "2026-10-18T15:15:00+05:30", "2026-10-18T15:45:00+05:30"),
  ev("review", "Store launch review", "2026-10-19T14:00:00+05:30", "2026-10-19T15:00:00+05:30", { location: "Boardroom 1" }),
  ev("one-on-one", "1:1 with Meera", "2026-10-20T16:00:00+05:30", "2026-10-20T16:30:00+05:30"),
];
