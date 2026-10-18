import { randomBytes } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import nodemailer from "nodemailer";
import { open, seal, type ProviderTokens } from "../services/sessions.js";

// Yahoo Mail over IMAP/SMTP with OAuth 2.0 (XOAUTH2). Yahoo offers no public mail REST API, and Mail access
// for an app must be approved by Yahoo. Scopes: "mail-r" to read; "mail-w" only when the person allows sending.

const AUTH_URL = "https://api.login.yahoo.com/oauth2/request_auth";
const TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token";
const USERINFO_URL = "https://api.login.yahoo.com/openid/v1/userinfo";

export const yahooHttp = { fetch: (url: string, init?: RequestInit) => fetch(url, init) }; // swappable in tests

export function yahooConfig(): { ok: true; clientId: string; secret: string; redirect: string } | { ok: false; reason: string } {
  const clientId = process.env.YAHOO_CLIENT_ID;
  const secret = process.env.YAHOO_CLIENT_SECRET;
  const redirect = process.env.YAHOO_REDIRECT_URI;
  if (!clientId || !secret || !redirect) return { ok: false, reason: "Yahoo is not set up on the server (YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET, YAHOO_REDIRECT_URI)" };
  return { ok: true, clientId, secret, redirect };
}

export function authorizeUrl(send: boolean, loginHint?: string): { url: string; state: string } {
  const cfg = yahooConfig();
  if (!cfg.ok) throw new Error(cfg.reason);
  const state = randomBytes(16).toString("base64url");
  const q = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirect, response_type: "code", scope: `openid email mail-r${send ? " mail-w" : ""}`, state, language: "en-us", prompt: "login", ...(loginHint ? { login_hint: loginHint } : {}) });
  return { url: `${AUTH_URL}?${q}`, state };
}

async function tokenRequest(body: Record<string, string>) {
  const cfg = yahooConfig();
  if (!cfg.ok) throw new Error(cfg.reason);
  const res = await yahooHttp.fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.secret}`).toString("base64")}` },
    body: new URLSearchParams({ redirect_uri: cfg.redirect, ...body }).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`Yahoo token error: ${json.error_description ?? json.error ?? res.status}`);
  return json as { access_token: string; refresh_token?: string; expires_in?: number };
}

export async function exchangeCode(code: string, send: boolean): Promise<ProviderTokens> {
  const t = await tokenRequest({ grant_type: "authorization_code", code });
  const info = await yahooHttp.fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${t.access_token}` } });
  const user = (await info.json().catch(() => ({}))) as { email?: string };
  if (!user.email) throw new Error("Yahoo did not share the account's email address (openid email scope)");
  return { email: user.email, access: seal(t.access_token), refresh: t.refresh_token ? seal(t.refresh_token) : null, expires_at: Date.now() + (t.expires_in ?? 3600) * 1000, can_send: send };
}

/** A valid access token, refreshed when it is about to expire. */
export async function accessToken(tok: ProviderTokens): Promise<string> {
  if (tok.expires_at > Date.now() + 60_000) return open(tok.access);
  if (!tok.refresh) throw new Error("the Yahoo session expired; connect again");
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: open(tok.refresh) });
  tok.access = seal(t.access_token);
  if (t.refresh_token) tok.refresh = seal(t.refresh_token);
  tok.expires_at = Date.now() + (t.expires_in ?? 3600) * 1000;
  return t.access_token;
}

const addr = (a?: AddressObject | AddressObject[]) => (Array.isArray(a) ? a : a ? [a] : []).flatMap((x) => x.value).map((v) => ({ name: v.name || undefined, email: v.address ?? "unknown@unknown" }));
const iso = (d: Date) => {
  const off = -d.getTimezoneOffset();
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  return `${new Date(d.getTime() + off * 60_000).toISOString().slice(0, 19)}${off < 0 ? "-" : "+"}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
};

/** Latest messages from INBOX (and Sent, when present) as the web app's MailMessage shape. */
export async function fetchYahoo(tok: ProviderTokens, max = 30) {
  const client = new ImapFlow({ host: "imap.mail.yahoo.com", port: 993, secure: true, auth: { user: tok.email, accessToken: await accessToken(tok) }, logger: false });
  await client.connect();
  const accountId = `yahoo:${tok.email}`;
  const out: unknown[] = [];
  try {
    for (const [folder, direction] of [["INBOX", "inbound"], ["Sent", "outbound"]] as const) {
      const lock = await client.getMailboxLock(folder).catch(() => null);
      if (!lock) continue;
      try {
        const exists = typeof client.mailbox === "object" && client.mailbox ? client.mailbox.exists : 0;
        if (!exists) continue;
        const take = direction === "inbound" ? max : Math.ceil(max / 2);
        for await (const msg of client.fetch(`${Math.max(1, exists - take + 1)}:*`, { uid: true, flags: true, source: true, internalDate: true })) {
          const p = await simpleParser(msg.source as Buffer);
          out.push({
            id: `yh:${folder}:${msg.uid}`,
            account_id: accountId,
            provider_message_id: String(msg.uid),
            rfc822_id: p.messageId,
            thread_id: (p.references && (Array.isArray(p.references) ? p.references[0] : p.references)) || p.inReplyTo || p.messageId,
            from: addr(p.from)[0] ?? { email: "unknown@unknown" },
            to: addr(p.to),
            cc: addr(p.cc),
            subject: p.subject || "(no subject)",
            body: tidy(p.text || "").slice(0, 8000) || "(empty message)",
            ...(typeof p.html === "string" && p.html.length <= 300_000 ? { html: p.html } : {}),
            received_at: iso(p.date ?? (msg.internalDate as Date) ?? new Date()),
            direction,
            read: msg.flags?.has("\\Seen") ?? false,
            starred: msg.flags?.has("\\Flagged") ?? false,
            attachments: p.attachments.map((a) => ({ name: a.filename ?? "attachment", size_kb: Math.round(a.size / 1024) })),
            list_unsubscribe: !!p.headers.get("list-unsubscribe"),
          });
        }
      } finally {
        lock.release();
      }
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
  return {
    account: { id: accountId, provider: "yahoo", address: tok.email, display_name: tok.email, mode: "connected", status: "ok", last_sync_at: new Date().toISOString(), send_enabled: tok.can_send },
    messages: out,
  };
}

/** Plain text without "[image: …]" placeholders, layout indentation or runs of blank lines. */
const tidy = (t: string) =>
  t
    .replace(/\r\n?/g, "\n")
    .replace(/\[image:[^\]]*\]/gi, "")
    .split("\n")
    .map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export async function sendYahoo(tok: ProviderTokens, m: { to: { name?: string; email: string }[]; cc: { name?: string; email: string }[]; subject: string; body: string; in_reply_to: string | null }) {
  if (!tok.can_send) throw new Error("sending is not allowed for this Yahoo account yet");
  const transport = nodemailer.createTransport({ host: "smtp.mail.yahoo.com", port: 465, secure: true, auth: { type: "OAuth2", user: tok.email, accessToken: await accessToken(tok) } });
  const fmt = (a: { name?: string; email: string }[]) => a.map((x) => (x.name ? { name: x.name, address: x.email } : x.email));
  const info = await transport.sendMail({ from: tok.email, to: fmt(m.to), cc: fmt(m.cc), subject: m.subject, text: m.body, ...(m.in_reply_to ? { inReplyTo: m.in_reply_to, references: m.in_reply_to } : {}) });
  return { message_id: info.messageId };
}
