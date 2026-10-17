import fixture from "../../../data/fixture/C16/fixture.json";
import labels from "../../../data/labels/C16_labels.json";

// Demo mailbox seeding. Messages are INSERTED into the spare mailbox (Gmail API users.messages.insert):
// nothing is sent, and every sender and address below is synthetic (.example domains).

const OPS = { name: "Priya Sharma (Store Ops)", email: "priya.ops@acme-retail.example" };
const PILOT = { name: "Rahul Verma (Pilot PM)", email: "rahul.pm@acme-retail.example" };
const SENDER: Record<string, { name: string; email: string }> = {
  "T-dup-ticket": OPS,
  "T-export": { name: "Data Team", email: "data@acme-retail.example" },
  "T-missing-ids": PILOT,
  "T-catalogue": { name: "Meera Iyer (Catalogue)", email: "meera.catalogue@acme-retail.example" },
  "T-test-data": PILOT,
  "T-clarify": { name: "Finance Analytics", email: "analytics@acme-retail.example" },
  QUARANTINE: { name: "IT Admin", email: "it.admin.helpdesk@mailbox.example" },
};

/** Realistic extras: phishing, fake urgency, sensitive, delegate, genuine urgent work, newsletter. */
const EXTRAS: { from: { name: string; email: string }; subject: string; body: string; hoursAgo: number; unsubscribe?: boolean }[] = [
  { from: { name: "PayPaI Security", email: "security-alert@paypa1-verify.example" }, subject: "URGENT: Your account will be suspended", body: "We detected unusual activity. Click here to verify your account and confirm your password within 24 hours or your account will be closed.\nhttp://paypa1-verify.example/login", hoursAgo: 3 },
  { from: { name: "MegaMart Deals", email: "offers@megamart-deals.example" }, subject: "IMPORTANT!!! 70% off ends tonight", body: "Our biggest sale of the season is live. Shop shoes, bags and more. Don't miss out!", hoursAgo: 5, unsubscribe: true },
  { from: { name: "HR Team", email: "hr@acme-retail.example" }, subject: "Your salary revision letter", body: "Please find details of your salary revision and appraisal outcome. This is confidential; reply with any questions about your compensation.", hoursAgo: 6 },
  { from: { name: "Bank Alerts", email: "alerts@yourbank.example" }, subject: "OTP for your transaction", body: "Your one-time password is 482913. Do not share it with anyone.", hoursAgo: 1 },
  { from: { name: "Anita Rao (CTO)", email: "anita.cto@acme-retail.example" }, subject: "Checkout is down in production", body: "Checkout has been failing for all stores since 9:10. Please investigate immediately and send me an update within the hour. This is blocking every sale.", hoursAgo: 0.5 },
  { from: { name: "Vikram (Store Mumbai)", email: "vikram.store@acme-retail.example" }, subject: "Price tags wrong in Bandra", body: "Price tags for the new arrivals in Bandra are wrong. Owner: Kiran from the merchandising team. Due tomorrow.", hoursAgo: 2 },
  { from: { name: "Sneha (Partnerships)", email: "sneha.partners@acme-retail.example" }, subject: "Q4 vendor review deck", body: "Could you prepare the Q4 vendor review slides? We present them on 30 October.", hoursAgo: 8 },
  { from: { name: "Product Newsletter", email: "news@saas-weekly.example" }, subject: "This week in retail tech", body: "Five trends shaping retail this quarter, plus our favourite reads.", hoursAgo: 12, unsubscribe: true },
  { from: { name: "Arjun (Logistics)", email: "arjun.logistics@acme-retail.example" }, subject: "Courier API issue resolved", body: "The courier API is restored and orders are shipping again. No action needed from your side.", hoursAgo: 4 },
  { from: { name: "Karan (Finance)", email: "karan.finance@acme-retail.example" }, subject: "Which cost centre for the pilot?", body: "Which cost centre should the pilot expenses go to, retail ops or IT?", hoursAgo: 7 },
];

const b64 = (s: string) => Utilities.base64EncodeWebSafe(Utilities.newBlob(s).getBytes());
const rfcDate = (d: Date) => Utilities.formatDate(d, Session.getScriptTimeZone(), "EEE, dd MMM yyyy HH:mm:ss Z");

function insert(o: { from: { name: string; email: string }; subject: string; body: string; date: Date; threadId?: string; refs?: string; messageId: string; unsubscribe?: boolean }): string {
  const to = Session.getEffectiveUser().getEmail();
  const headers = [
    `From: "${o.from.name}" <${o.from.email}>`,
    `To: ${to}`,
    `Subject: ${o.subject}`,
    `Date: ${rfcDate(o.date)}`,
    `Message-ID: ${o.messageId}`,
    ...(o.refs ? [`In-Reply-To: ${o.refs}`, `References: ${o.refs}`] : []),
    ...(o.unsubscribe ? [`List-Unsubscribe: <mailto:unsubscribe@${o.from.email.split("@")[1]}>`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
  ];
  const res = Gmail.Users!.Messages!.insert({ raw: b64(`${headers.join("\r\n")}\r\n\r\n${o.body}`), labelIds: ["INBOX", "UNREAD"], threadId: o.threadId } as GoogleAppsScript.Gmail.Schema.Message, "me");
  return res.threadId!;
}

/** Inserts the 12 C16 fixture emails (grouped into their real threads) and the realistic extras. */
export function seedDemoInbox(): { inserted: number } {
  const byId = new Map(fixture.records.emails.map((e) => [e.email_id, e]));
  const groups = new Map<string, string[]>();
  for (const l of labels.labels) groups.set(l.thread_key, [...(groups.get(l.thread_key) ?? []), l.email_id]);
  let inserted = 0;
  for (const [key, ids] of groups) {
    const ordered = ids.map((id) => byId.get(id)!).sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at));
    const subject = ordered[0].subject; // Gmail threads need one subject; the misleading fixture subjects are kept per thread
    let threadId: string | undefined;
    let firstId: string | undefined;
    for (const e of ordered) {
      const messageId = `<c16-${e.email_id.toLowerCase()}@acme-retail.example>`;
      threadId = insert({ from: SENDER[key] ?? OPS, subject: firstId ? `Re: ${subject}` : subject, body: e.body, date: new Date(e.received_at), threadId, refs: firstId, messageId });
      firstId ??= messageId;
      inserted++;
    }
  }
  for (const [i, x] of EXTRAS.entries()) {
    insert({ from: x.from, subject: x.subject, body: x.body, date: new Date(Date.now() - x.hoursAgo * 3_600_000), messageId: `<c16-extra-${i}@seed.example>`, unsubscribe: x.unsubscribe });
    inserted++;
  }
  return { inserted };
}
