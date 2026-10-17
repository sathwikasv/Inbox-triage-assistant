import type { Address, CalendarEvent, MailAccount, MailMessage } from "@c16/core";
import { ProviderError, htmlToText, isoWithOffset, setting, type CalendarProviderClient, type MailProviderClient, type OutgoingReply } from "./types";

// Gmail and Google Calendar through Google Identity Services (OAuth 2.0 token model).
// Access tokens live in memory for this tab only: never in storage, never sent to our server.
// Scopes are requested one at a time, when the feature that needs them is first used.

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
    google?: { accounts: { oauth2: { initTokenClient: (c: { client_id: string; scope: string; include_granted_scopes?: boolean; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string; message?: string }) => void }) => TokenClient; revoke: (token: string, done?: () => void) => void } } };
  }
}

const tokens = new Map<ScopeName, { token: string; expires: number }>();

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

async function token(scope: ScopeName, interactive = true): Promise<string> {
  const have = tokens.get(scope);
  if (have && have.expires > Date.now() + 60_000) return have.token;
  const clientId = setting("google");
  if (!clientId) throw new ProviderError("gmail", "add a Google OAuth Client ID in Settings first");
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES[scope],
      include_granted_scopes: true,
      callback: (r) => {
        if (!r.access_token) return reject(new ProviderError("gmail", r.error_description || r.error || "Google did not grant access"));
        tokens.set(scope, { token: r.access_token, expires: Date.now() + (r.expires_in ?? 3600) * 1000 });
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new ProviderError("gmail", e.type === "popup_closed" ? "the Google window was closed" : e.message || e.type)),
    });
    client.requestAccessToken({ prompt: interactive ? "" : "none" });
  });
}

async function call<T>(scope: ScopeName, url: string, init: RequestInit = {}): Promise<T> {
  const t = await token(scope);
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${t}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  if (res.status === 401) tokens.delete(scope);
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

async function fetchMessages(account: MailAccount, max = 30): Promise<MailMessage[]> {
  const list = await call<{ messages?: { id: string }[] }>("read", `${GMAIL}/messages?maxResults=${max}&q=${encodeURIComponent("newer_than:30d (in:inbox OR in:sent)")}`);
  const full = await Promise.all((list.messages ?? []).map((m) => call<GmailMessage>("read", `${GMAIL}/messages/${m.id}?format=full`)));
  return full.map((g) => {
    const h = (n: string) => g.payload.headers?.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value;
    const { text, html } = textOf(g.payload);
    return {
      id: `gm:${g.id}`,
      account_id: account.id,
      provider_message_id: g.id,
      rfc822_id: h("Message-ID") ?? h("Message-Id"),
      thread_id: g.threadId,
      from: parseAddresses(h("From"))[0] ?? { email: "unknown@unknown" },
      to: parseAddresses(h("To")),
      cc: parseAddresses(h("Cc")),
      subject: h("Subject") || "(no subject)",
      body: (text || htmlToText(html) || g.snippet || "(empty message)").slice(0, 8000),
      received_at: isoWithOffset(Number(g.internalDate)),
      direction: (g.labelIds ?? []).includes("SENT") ? "outbound" : "inbound",
      read: !(g.labelIds ?? []).includes("UNREAD"),
      starred: (g.labelIds ?? []).includes("STARRED"),
      attachments: attachmentsOf(g.payload),
      list_unsubscribe: !!h("List-Unsubscribe"),
    };
  });
}

export const gmail: MailProviderClient = {
  provider: "gmail",
  label: "Gmail",
  setupNeeded: () => (setting("google") ? null : "Add a Google OAuth Client ID in Settings → Integrations"),
  async connect() {
    const profile = await call<{ emailAddress: string }>("read", `${GMAIL}/profile`);
    const account: MailAccount = { id: `gmail:${profile.emailAddress}`, provider: "gmail", address: profile.emailAddress, display_name: profile.emailAddress, mode: "connected", status: "ok", last_sync_at: new Date().toISOString(), send_enabled: false };
    return { account, messages: await fetchMessages(account) };
  },
  refresh: (account) => fetchMessages(account),
  async enableSend() {
    await token("send");
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
    const sent = await call<{ id: string }>("send", `${GMAIL}/messages/send`, { method: "POST", body: JSON.stringify({ raw: toB64Url(mime), threadId: r.in_reply_to.thread_id }) });
    return { message_id: sent.id };
  },
  async disconnect() {
    for (const [, t] of tokens) window.google?.accounts.oauth2.revoke(t.token);
    tokens.clear();
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
