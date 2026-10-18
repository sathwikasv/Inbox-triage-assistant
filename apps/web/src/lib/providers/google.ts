import type { Address, CalendarEvent, MailAccount, MailMessage } from "@c16/core";
import { ProviderError, htmlToText, isoWithOffset, keepHtml, setting, tidyText, type CalendarProviderClient, type MailProviderClient, type OutgoingReply } from "./types";

// Gmail and Google Calendar through Google Identity Services (OAuth 2.0 token model).
// Access tokens live in memory for this tab only: never in storage, never sent to our server.
// Scopes are requested one at a time, when the feature that needs them is first used.
// Several Gmail / Google Workspace accounts can be connected at once: tokens are kept per account.

const SCOPES = {
  read: "https://www.googleapis.com/auth/gmail.readonly",
  send: "https://www.googleapis.com/auth/gmail.send",
  calendar: "https://www.googleapis.com/auth/calendar.events",
} as const;
type ScopeName = keyof typeof SCOPES;

type TokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string };
type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient: (c: { client_id: string; scope: string; include_granted_scopes?: boolean; hint?: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string; message?: string }) => void }) => TokenClient; revoke: (token: string, done?: () => void) => void } } };
  }
}

// Tokens by account (lowercase address). The "" slot holds a token whose account is not known yet
// (during sign-in) and the shared calendar token.
const tokens = new Map<string, Map<ScopeName, { token: string; expires: number }>>();
const slot = (email?: string) => {
  const k = email ? email.toLowerCase() : "";
  if (!tokens.has(k)) tokens.set(k, new Map());
  return tokens.get(k)!;
};
/** Once the profile names the account, the sign-in token belongs to it. */
const claimPending = (email: string) => {
  const t = tokens.get("")?.get("read");
  if (!t) return;
  slot(email).set("read", t);
  tokens.get("")!.delete("read");
};

// Signed in with Google: the server holds the (encrypted) Gmail grants of the login and hands out short-lived
// read tokens, so those accounts connect without any popup, also after a reload.
let serverAccounts: { email: string; company: string | null }[] = [];
export const linkServerGmail = (accounts: { email: string; company: string | null }[]) => {
  serverAccounts = accounts.map((a) => ({ email: a.email.toLowerCase(), company: a.company }));
};
export const serverGmailLinked = () => serverAccounts.length > 0;
export const serverGmailAccounts = () => serverAccounts;
const isServerLinked = (email?: string) => (email ? serverAccounts.some((a) => a.email === email.toLowerCase()) : serverAccounts.length > 0);

async function serverToken(email?: string): Promise<string | null> {
  const api = setting("api").replace(/\/$/, "");
  if (!isServerLinked(email) || !api) return null;
  try {
    const r = await fetch(`${api}/auth/google/token${email ? `?email=${encodeURIComponent(email)}` : ""}`, { credentials: "include" });
    if (!r.ok) return null;
    const j = (await r.json()) as { access_token: string; expires_in: number; email: string };
    slot(j.email).set("read", { token: j.access_token, expires: Date.now() + j.expires_in * 1000 });
    return j.access_token;
  } catch {
    return null;
  }
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new ProviderError("gmail", "could not load Google sign-in (check the network)"));
    document.head.appendChild(s);
  });
}

interface TokenOptions {
  email?: string; // the account the token is for; Google is asked for exactly that one
  pick?: boolean; // ignore anything cached or held by the server and let the person choose an account
}

async function token(scope: ScopeName, o: TokenOptions = {}): Promise<string> {
  if (!o.pick) {
    const have = slot(o.email).get(scope);
    if (have && have.expires > Date.now() + 60_000) return have.token;
    if (scope === "read") {
      const fromServer = await serverToken(o.email);
      if (fromServer) return fromServer;
    }
  }
  const clientId = setting("google");
  if (!clientId) throw new ProviderError("gmail", "add a Google OAuth Client ID in Settings first");
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES[scope],
      include_granted_scopes: true,
      ...(o.email ? { hint: o.email } : {}), // Google targets exactly this account
      callback: (r) => {
        if (!r.access_token) return reject(new ProviderError("gmail", r.error_description || r.error || "Google did not grant access"));
        slot(o.email).set(scope, { token: r.access_token, expires: Date.now() + (r.expires_in ?? 3600) * 1000 });
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new ProviderError("gmail", e.type === "popup_closed" ? "the Google window was closed" : e.message || e.type)),
    });
    // select_account: with several Gmail or Workspace accounts the person can pick another one each time.
    client.requestAccessToken({ prompt: o.email ? "" : "select_account" });
  });
}

async function call<T>(scope: ScopeName, url: string, init: RequestInit = {}, o: TokenOptions = {}): Promise<T> {
  const t = await token(scope, o);
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${t}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  if (res.status === 401) slot(o.email).delete(scope);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new ProviderError("gmail", `Google API ${res.status}: ${body.error?.message ?? res.statusText}`);
  }
  return (res.status === 204 ? undefined : res.json()) as Promise<T>;
}

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

type Part = { mimeType?: string; filename?: string; body?: { data?: string; size?: number }; parts?: Part[]; headers?: { name: string; value: string }[] };
type GmailMessage = { id: string; threadId: string; labelIds?: string[]; internalDate: string; snippet: string; payload: Part };

const fromB64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
const toB64Url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function textOf(p: Part): { text: string; html: string } {
  if (p.mimeType === "text/plain" && p.body?.data) return { text: fromB64(p.body.data), html: "" };
  if (p.mimeType === "text/html" && p.body?.data) return { text: "", html: fromB64(p.body.data) };
  let text = "";
  let html = "";
  for (const c of p.parts ?? []) {
    const r = textOf(c);
    text ||= r.text;
    html ||= r.html;
  }
  return { text, html };
}

function attachmentsOf(p: Part, out: { name: string; size_kb?: number }[] = []) {
  if (p.filename) out.push({ name: p.filename, size_kb: p.body?.size ? Math.round(p.body.size / 1024) : undefined });
  for (const c of p.parts ?? []) attachmentsOf(c, out);
  return out;
}

export function parseAddresses(v: string | undefined): Address[] {
  if (!v) return [];
  return v
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^"?([^"<]*?)"?\s*<([^>]+)>$/.exec(s);
      return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: s };
    });
}

const fmtAddr = (a: Address[]) => a.map((x) => (x.name ? `"${x.name.replace(/"/g, "")}" <${x.email}>` : x.email)).join(", ");
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(s)))}?=`);

/** The newest mail of one account, fetched with that account's own token. */
async function fetchMessages(account: MailAccount, max = 30): Promise<MailMessage[]> {
  const who = { email: account.address };
  const list = await call<{ messages?: { id: string }[] }>("read", `${GMAIL}/messages?maxResults=${max}&q=${encodeURIComponent("newer_than:30d (in:inbox OR in:sent)")}`, {}, who);
  const full = await Promise.all((list.messages ?? []).map((m) => call<GmailMessage>("read", `${GMAIL}/messages/${m.id}?format=full`, {}, who)));
  return full.map((g) => {
    const h = (n: string) => g.payload.headers?.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value;
    const { text, html } = textOf(g.payload);
    return {
      id: `gm:${account.address}:${g.id}`, // unique across accounts
      account_id: account.id,
      provider_message_id: g.id,
      rfc822_id: h("Message-ID") ?? h("Message-Id"),
      thread_id: g.threadId,
      from: parseAddresses(h("From"))[0] ?? { email: "unknown@unknown" },
      to: parseAddresses(h("To")),
      cc: parseAddresses(h("Cc")),
      subject: h("Subject") || "(no subject)",
      body: ((text && tidyText(text)) || (html && htmlToText(html)) || g.snippet || "(empty message)").slice(0, 8000),
      html: keepHtml(html),
      labels: g.labelIds ?? [],
      received_at: isoWithOffset(Number(g.internalDate)),
      direction: (g.labelIds ?? []).includes("SENT") ? "outbound" : "inbound",
      read: !(g.labelIds ?? []).includes("UNREAD"),
      starred: (g.labelIds ?? []).includes("STARRED"),
      attachments: attachmentsOf(g.payload),
      list_unsubscribe: !!h("List-Unsubscribe"),
    };
  });
}

const accountFor = (email: string): MailAccount => ({ id: `gmail:${email.toLowerCase()}`, provider: "gmail", address: email.toLowerCase(), display_name: email.toLowerCase(), mode: "connected", status: "ok", last_sync_at: new Date().toISOString(), send_enabled: false });

export const gmail: MailProviderClient = {
  provider: "gmail",
  label: "Gmail",
  setupNeeded: () => (setting("google") ? null : "Add a Google OAuth Client ID in Settings → Integrations"),
  // Shows Google's account chooser, so another Gmail or Google Workspace account can be added next to the others.
  async connect(opts) {
    await token("read", { email: opts?.hint, pick: !opts?.hint });
    const profile = await call<{ emailAddress: string }>("read", `${GMAIL}/profile`, {}, { email: opts?.hint });
    claimPending(profile.emailAddress);
    const account = accountFor(profile.emailAddress);
    return { account, messages: await fetchMessages(account) };
  },
  refresh: (account) => fetchMessages(account),
  async enableSend(account) {
    await token("send", { email: account.address });
  },
  async send(account, r: OutgoingReply) {
    const ref = r.in_reply_to.rfc822_id;
    const mime = [
      `From: ${account.address}`,
      `To: ${fmtAddr(r.to)}`,
      ...(r.cc.length ? [`Cc: ${fmtAddr(r.cc)}`] : []),
      `Subject: ${encodeHeader(r.subject)}`,
      ...(ref ? [`In-Reply-To: ${ref}`, `References: ${ref}`] : []),
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      r.body,
    ].join("\r\n");
    const sent = await call<{ id: string }>("send", `${GMAIL}/messages/send`, { method: "POST", body: JSON.stringify({ raw: toB64Url(mime), threadId: r.in_reply_to.thread_id }) }, { email: account.address });
    return { message_id: sent.id };
  },
  // Only this account is revoked and forgotten; the other connected Gmail accounts stay connected.
  async disconnect(account) {
    const email = account.address.toLowerCase();
    if (isServerLinked(email)) {
      await fetch(`${setting("api").replace(/\/$/, "")}/auth/google/disconnect?email=${encodeURIComponent(email)}`, { method: "POST", credentials: "include" }).catch(() => undefined);
      serverAccounts = serverAccounts.filter((a) => a.email !== email);
    }
    for (const [, t] of tokens.get(email) ?? []) window.google?.accounts.oauth2.revoke(t.token);
    tokens.delete(email);
  },
  // Every Gmail account linked to the login comes back without a popup, also after a page reload.
  async restoreAll() {
    const out: { account: MailAccount; messages: MailMessage[] }[] = [];
    for (const a of serverAccounts) {
      if (!(await serverToken(a.email))) continue;
      const account = accountFor(a.email);
      if (a.company) account.company = a.company;
      out.push({ account, messages: await fetchMessages(account).catch(() => []) });
    }
    return out;
  },
};

const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
type GEvent = { id: string; summary?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string }; location?: string; hangoutLink?: string; reminders?: { overrides?: { minutes: number }[] } };

const toEvent = (e: GEvent): CalendarEvent => ({
  id: `gcal:${e.id}`,
  title: e.summary ?? "(no title)",
  start: e.start.dateTime ?? `${e.start.date}T00:00:00Z`,
  end: e.end.dateTime ?? `${e.end.date}T00:00:00Z`,
  all_day: !e.start.dateTime,
  location: e.location ?? null,
  link: e.hangoutLink ?? null,
  participants: [],
  reminders_min: e.reminders?.overrides?.map((o) => o.minutes) ?? [],
  source_message_id: null,
  calendar: "google",
  simulated: false,
});

export const googleCalendar: CalendarProviderClient = {
  calendar: "google",
  label: "Google Calendar",
  setupNeeded: () => (setting("google") ? null : "Add a Google OAuth Client ID in Settings → Integrations"),
  async connect() {
    const events = await this.list();
    const me = await call<{ id: string }>("calendar", "https://www.googleapis.com/calendar/v3/calendars/primary");
    return { address: me.id, events };
  },
  async list() {
    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 60 * 86_400_000).toISOString();
    const r = await call<{ items?: GEvent[] }>("calendar", `${CAL}?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${encodeURIComponent(from)}&timeMax=${encodeURIComponent(to)}`);
    return (r.items ?? []).map(toEvent);
  },
  async create(e) {
    // No attendees are added, so Google sends no invitations on the person's behalf.
    const body = {
      summary: e.title,
      location: e.location ?? undefined,
      description: [e.link ? `Join: ${e.link}` : "", "Added from Triagedesk after you confirmed it."].filter(Boolean).join("\n"),
      start: e.all_day ? { date: e.start.slice(0, 10) } : { dateTime: e.start },
      end: e.all_day ? { date: e.end.slice(0, 10) } : { dateTime: e.end },
      reminders: { useDefault: false, overrides: e.reminders_min.map((minutes) => ({ method: "popup", minutes })) },
    };
    return { ...toEvent(await call<GEvent>("calendar", CAL, { method: "POST", body: JSON.stringify(body) })), source_message_id: e.source_message_id, participants: e.participants };
  },
};
