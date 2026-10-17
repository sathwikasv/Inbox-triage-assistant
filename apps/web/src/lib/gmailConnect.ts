import type { Address, MailAccount, MailMessage } from "@c16/core";

// CONNECTED MODE (Gmail): OAuth 2.0 through Google Identity Services, read-only scope.
// The access token lives in memory for this tab only: never in storage, never sent to our server.
// Needs a Web OAuth Client ID (not a secret) with this site's origin as an authorised JavaScript origin.

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

type TokenResponse = { access_token?: string; error?: string; error_description?: string };
type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient: (c: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string; message?: string }) => void }) => TokenClient } } };
  }
}

export const GOOGLE_CLIENT_ID_KEY = "c16.google_client_id";
export function savedClientId(): string {
  try {
    return import.meta.env.VITE_GOOGLE_CLIENT_ID || localStorage.getItem(GOOGLE_CLIENT_ID_KEY) || "";
  } catch {
    return import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
  }
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("could not load Google sign-in (check the network)"));
    document.head.appendChild(s);
  });
}

function getToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => (r.access_token ? resolve(r.access_token) : reject(new Error(r.error_description || r.error || "Google did not grant access"))),
      error_callback: (e) => reject(new Error(e.message || (e.type === "popup_closed" ? "the Google window was closed" : e.type))),
    });
    client.requestAccessToken({ prompt: "consent" });
  });
}

async function api<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Gmail API ${res.status}: ${body.error?.message ?? res.statusText}`);
  }
  return res.json() as Promise<T>;
}

type Part = { mimeType?: string; filename?: string; body?: { data?: string; size?: number }; parts?: Part[]; headers?: { name: string; value: string }[] };
type GmailMessage = { id: string; threadId: string; labelIds?: string[]; internalDate: string; snippet: string; payload: Part };

const b64 = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

function textOf(p: Part): { text: string; html: string } {
  if (p.mimeType === "text/plain" && p.body?.data) return { text: b64(p.body.data), html: "" };
  if (p.mimeType === "text/html" && p.body?.data) return { text: "", html: b64(p.body.data) };
  let text = "";
  let html = "";
  for (const c of p.parts ?? []) {
    const r = textOf(c);
    text ||= r.text;
    html ||= r.html;
  }
  return { text, html };
}

const stripHtml = (h: string) => new DOMParser().parseFromString(h.replace(/<(br|\/p|\/div|\/li)>/gi, "\n$&"), "text/html").body.textContent?.replace(/\n{3,}/g, "\n\n").trim() ?? "";

function attachmentsOf(p: Part, out: { name: string; size_kb?: number }[] = []) {
  if (p.filename) out.push({ name: p.filename, size_kb: p.body?.size ? Math.round(p.body.size / 1024) : undefined });
  for (const c of p.parts ?? []) attachmentsOf(c, out);
  return out;
}

function parseAddresses(v: string | undefined): Address[] {
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

/** Local ISO with the browser's offset, as the triage engine expects. */
function isoWithOffset(ms: number): string {
  const d = new Date(ms);
  const off = -d.getTimezoneOffset();
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const local = new Date(ms + off * 60_000).toISOString().slice(0, 19);
  return `${local}${off < 0 ? "-" : "+"}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}

export async function connectGmail(clientId: string, max = 25): Promise<{ account: MailAccount; messages: MailMessage[] }> {
  await loadGis();
  const token = await getToken(clientId);
  const profile = await api<{ emailAddress: string }>(token, "/profile");
  const list = await api<{ messages?: { id: string }[] }>(token, `/messages?maxResults=${max}&q=${encodeURIComponent("in:inbox OR in:sent newer_than:30d")}`);
  const account: MailAccount = { id: `gmail:${profile.emailAddress}`, provider: "gmail", address: profile.emailAddress, display_name: `${profile.emailAddress} (Gmail)`, mode: "connected", status: "ok", last_sync_at: new Date().toISOString(), send_enabled: false };
  const full = await Promise.all((list.messages ?? []).map((m) => api<GmailMessage>(token, `/messages/${m.id}?format=full`)));
  const messages: MailMessage[] = full.map((g) => {
    const h = (n: string) => g.payload.headers?.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value;
    const { text, html } = textOf(g.payload);
    const from = parseAddresses(h("From"))[0] ?? { email: "unknown@unknown" };
    const outbound = (g.labelIds ?? []).includes("SENT");
    return {
      id: `gm:${g.id}`,
      account_id: account.id,
      provider_message_id: g.id,
      thread_id: g.threadId,
      from,
      to: parseAddresses(h("To")),
      cc: parseAddresses(h("Cc")),
      subject: h("Subject") || "(no subject)",
      body: (text || stripHtml(html) || g.snippet || "(empty message)").slice(0, 8000),
      received_at: isoWithOffset(Number(g.internalDate)),
      direction: outbound ? "outbound" : "inbound",
      read: !(g.labelIds ?? []).includes("UNREAD"),
      starred: (g.labelIds ?? []).includes("STARRED"),
      attachments: attachmentsOf(g.payload),
      list_unsubscribe: !!h("List-Unsubscribe"),
    };
  });
  return { account, messages };
}
