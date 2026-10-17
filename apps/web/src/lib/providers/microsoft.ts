import type { AccountInfo, PublicClientApplication } from "@azure/msal-browser";
import type { Address, CalendarEvent, MailAccount, MailMessage } from "@c16/core";
import { ProviderError, htmlToText, isoWithOffset, setting, type CalendarProviderClient, type MailProviderClient, type OutgoingReply } from "./types";

// Outlook mail and calendar through Microsoft Graph, signed in with MSAL (OAuth 2.0 auth code + PKCE).
// Tokens are kept in memory only (cacheLocation "memoryStorage"). Each permission is asked for when needed.

const SCOPES = { read: ["User.Read", "Mail.Read"], send: ["Mail.Send"], calendar: ["Calendars.ReadWrite"] } as const;
const GRAPH = "https://graph.microsoft.com/v1.0";

let app: PublicClientApplication | null = null;
let appFor = "";
let signedIn: AccountInfo | null = null;

async function msal(): Promise<PublicClientApplication> {
  const clientId = setting("microsoft");
  if (!clientId) throw new ProviderError("outlook", "add a Microsoft (Entra) application ID in Settings first");
  if (!app || appFor !== clientId) {
    const { PublicClientApplication: Pca } = await import("@azure/msal-browser"); // loaded only when Outlook is used
    app = new Pca({ auth: { clientId, authority: "https://login.microsoftonline.com/common", redirectUri: window.location.origin }, cache: { cacheLocation: "memoryStorage" } });
    await app.initialize();
    appFor = clientId;
    signedIn = null;
  }
  return app;
}

async function token(scopes: readonly string[]): Promise<string> {
  const a = await msal();
  if (!signedIn) {
    const r = await a.loginPopup({ scopes: [...scopes], prompt: "select_account" });
    signedIn = r.account;
    return r.accessToken;
  }
  try {
    return (await a.acquireTokenSilent({ scopes: [...scopes], account: signedIn })).accessToken;
  } catch (e) {
    if ((e as { name?: string }).name === "InteractionRequiredAuthError") return (await a.acquireTokenPopup({ scopes: [...scopes], account: signedIn })).accessToken;
    throw new ProviderError("outlook", (e as Error).message);
  }
}

async function graph<T>(scopes: readonly string[], path: string, init: RequestInit = {}): Promise<T> {
  const t = await token(scopes);
  const res = await fetch(`${GRAPH}${path}`, { ...init, headers: { Authorization: `Bearer ${t}`, Prefer: 'outlook.body-content-type="text"', ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new ProviderError("outlook", `Microsoft Graph ${res.status}: ${body.error?.message ?? res.statusText}`);
  }
  return (res.status === 202 || res.status === 204 ? undefined : res.json()) as Promise<T>;
}

type GAddr = { emailAddress: { name?: string; address: string } };
type GMsg = {
  id: string;
  conversationId: string;
  internetMessageId?: string;
  subject?: string;
  from?: GAddr;
  toRecipients?: GAddr[];
  ccRecipients?: GAddr[];
  receivedDateTime: string;
  isRead: boolean;
  flag?: { flagStatus?: string };
  body?: { contentType: string; content: string };
  bodyPreview?: string;
  attachments?: { name: string; size?: number }[];
  internetMessageHeaders?: { name: string; value: string }[];
};

const addr = (a?: GAddr): Address => ({ name: a?.emailAddress.name, email: a?.emailAddress.address ?? "unknown@unknown" });
const gAddr = (a: Address[]) => a.map((x) => ({ emailAddress: { address: x.email, name: x.name } }));
const SELECT = "$select=id,conversationId,internetMessageId,subject,from,toRecipients,ccRecipients,receivedDateTime,isRead,flag,body,bodyPreview&$expand=attachments($select=name,size)";

async function fetchMessages(account: MailAccount): Promise<MailMessage[]> {
  const [inbox, sent] = await Promise.all([
    graph<{ value: GMsg[] }>(SCOPES.read, `/me/mailFolders/inbox/messages?$top=30&$orderby=receivedDateTime desc&${SELECT}`),
    graph<{ value: GMsg[] }>(SCOPES.read, `/me/mailFolders/sentitems/messages?$top=15&$orderby=receivedDateTime desc&${SELECT}`),
  ]);
  const map = (m: GMsg, direction: "inbound" | "outbound"): MailMessage => ({
    id: `ol:${m.id}`,
    account_id: account.id,
    provider_message_id: m.id,
    rfc822_id: m.internetMessageId,
    thread_id: m.conversationId,
    from: addr(m.from),
    to: (m.toRecipients ?? []).map(addr),
    cc: (m.ccRecipients ?? []).map(addr),
    subject: m.subject || "(no subject)",
    body: ((m.body?.contentType === "html" ? htmlToText(m.body.content) : m.body?.content) || m.bodyPreview || "(empty message)").slice(0, 8000),
    received_at: isoWithOffset(Date.parse(m.receivedDateTime)),
    direction,
    read: m.isRead,
    starred: m.flag?.flagStatus === "flagged",
    attachments: (m.attachments ?? []).map((a) => ({ name: a.name, size_kb: a.size ? Math.round(a.size / 1024) : undefined })),
    list_unsubscribe: false,
  });
  return [...inbox.value.map((m) => map(m, "inbound")), ...sent.value.map((m) => map(m, "outbound"))];
}

export const outlook: MailProviderClient = {
  provider: "outlook",
  label: "Outlook",
  setupNeeded: () => (setting("microsoft") ? null : "Add a Microsoft (Entra) application ID in Settings → Integrations"),
  async connect() {
    const me = await graph<{ mail?: string; userPrincipalName: string; displayName?: string }>(SCOPES.read, "/me?$select=mail,userPrincipalName,displayName");
    const address = me.mail || me.userPrincipalName;
    const account: MailAccount = { id: `outlook:${address}`, provider: "outlook", address, display_name: me.displayName || address, mode: "connected", status: "ok", last_sync_at: new Date().toISOString(), send_enabled: false };
    return { account, messages: await fetchMessages(account) };
  },
  refresh: (account) => fetchMessages(account),
  async enableSend() {
    await token(SCOPES.send);
  },
  async send(_account, r: OutgoingReply) {
    // Reply to the original so Outlook keeps the conversation; recipients and text are exactly what the person approved.
    await graph<void>(SCOPES.send, `/me/messages/${r.in_reply_to.provider_message_id}/reply`, {
      method: "POST",
      body: JSON.stringify({ message: { subject: r.subject, toRecipients: gAddr(r.to), ccRecipients: gAddr(r.cc), body: { contentType: "Text", content: r.body } } }),
    });
    return { message_id: `reply-to:${r.in_reply_to.provider_message_id}` };
  },
  async disconnect() {
    if (app && signedIn) await app.clearCache({ account: signedIn });
    signedIn = null;
  },
};

type OEvent = { id: string; subject?: string; start: { dateTime: string; timeZone: string }; end: { dateTime: string; timeZone: string }; isAllDay: boolean; location?: { displayName?: string }; onlineMeeting?: { joinUrl?: string }; reminderMinutesBeforeStart?: number };
const utc = (d: { dateTime: string; timeZone: string }) => (d.timeZone === "UTC" && !/[zZ]|[+-]\d\d:\d\d$/.test(d.dateTime) ? `${d.dateTime.slice(0, 19)}Z` : d.dateTime);
const toEvent = (e: OEvent): CalendarEvent => ({
  id: `ocal:${e.id}`,
  title: e.subject ?? "(no title)",
  start: utc(e.start),
  end: utc(e.end),
  all_day: e.isAllDay,
  location: e.location?.displayName || null,
  link: e.onlineMeeting?.joinUrl ?? null,
  participants: [],
  reminders_min: e.reminderMinutesBeforeStart ? [e.reminderMinutesBeforeStart] : [],
  source_message_id: null,
  calendar: "outlook",
  simulated: false,
});

export const outlookCalendar: CalendarProviderClient = {
  calendar: "outlook",
  label: "Outlook Calendar",
  setupNeeded: () => (setting("microsoft") ? null : "Add a Microsoft (Entra) application ID in Settings → Integrations"),
  async connect() {
    const events = await this.list();
    return { address: signedIn?.username ?? "Outlook", events };
  },
  async list() {
    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 60 * 86_400_000).toISOString();
    const r = await graph<{ value: OEvent[] }>(SCOPES.calendar, `/me/calendarView?startDateTime=${from}&endDateTime=${to}&$top=250&$select=id,subject,start,end,isAllDay,location,onlineMeeting,reminderMinutesBeforeStart`, { headers: { Prefer: 'outlook.timezone="UTC"' } });
    return r.value.map(toEvent);
  },
  async create(e) {
    // No attendees: Outlook sends no invitations on the person's behalf.
    const created = await graph<OEvent>(SCOPES.calendar, "/me/events", {
      method: "POST",
      headers: { Prefer: 'outlook.timezone="UTC"' },
      body: JSON.stringify({
        subject: e.title,
        start: { dateTime: new Date(e.start).toISOString().slice(0, 19), timeZone: "UTC" },
        end: { dateTime: new Date(e.end).toISOString().slice(0, 19), timeZone: "UTC" },
        isAllDay: e.all_day,
        location: e.location ? { displayName: e.location } : undefined,
        body: { contentType: "Text", content: [e.link ? `Join: ${e.link}` : "", "Added from Triagedesk after you confirmed it."].filter(Boolean).join("\n") },
        isReminderOn: e.reminders_min.length > 0,
        reminderMinutesBeforeStart: e.reminders_min[0] ?? 15,
      }),
    });
    return { ...toEvent(created), source_message_id: e.source_message_id, participants: e.participants };
  },
};
