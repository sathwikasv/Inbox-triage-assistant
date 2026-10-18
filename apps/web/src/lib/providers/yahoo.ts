import type { MailAccount, MailMessage } from "@c16/core";
import { ProviderError, setting, type MailProviderClient, type OutgoingReply } from "./types";

// Yahoo Mail has no public REST API. Access is IMAP/SMTP with OAuth 2.0 (XOAUTH2), which needs a server:
// the browser cannot speak IMAP, and the OAuth client secret must stay server-side. The API (apps/api)
// runs the OAuth flow, keeps the tokens encrypted in its own memory, and returns messages to this tab.
// Several Yahoo accounts can be connected at once: every call names the account it is about.

const api = () => setting("api").replace(/\/$/, "");
type Loaded = { account: MailAccount; messages: MailMessage[] };
const named = (email: string) => `?email=${encodeURIComponent(email)}`;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!api()) throw new ProviderError("yahoo", "Yahoo needs the Triagedesk server; set its URL in Settings → Integrations");
  const res = await fetch(`${api()}${path}`, { ...init, credentials: "include", headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ProviderError("yahoo", body.error ?? `server ${res.status}`);
  return body;
}

/** Opens Yahoo's consent page in a popup and waits for the server to report back. `email` pre-selects a known account. */
function consent(send = false, email?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const q = [send ? "send=1" : "", email ? `email=${encodeURIComponent(email)}` : ""].filter(Boolean).join("&");
    const w = window.open(`${api()}/providers/yahoo/start${q ? `?${q}` : ""}`, "yahoo-oauth", "width=520,height=680");
    if (!w) return reject(new ProviderError("yahoo", "the browser blocked the Yahoo sign-in window"));
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== new URL(api()).origin || e.data?.source !== "triagedesk-yahoo") return;
      window.removeEventListener("message", onMsg);
      clearInterval(timer);
      if (e.data.ok) resolve();
      else reject(new ProviderError("yahoo", e.data.error ?? "Yahoo did not grant access"));
    };
    window.addEventListener("message", onMsg);
    const timer = setInterval(() => {
      if (w.closed) {
        clearInterval(timer);
        window.removeEventListener("message", onMsg);
        reject(new ProviderError("yahoo", "the Yahoo window was closed"));
      }
    }, 500);
  });
}

export const yahoo: MailProviderClient = {
  provider: "yahoo",
  label: "Yahoo Mail",
  setupNeeded: () => (api() ? null : "Yahoo needs the Triagedesk server (IMAP + OAuth). Set its URL in Settings → Integrations"),
  async connect(opts) {
    const status = await call<{ configured: boolean; reason?: string }>("/providers/yahoo/status");
    if (!status.configured) throw new ProviderError("yahoo", status.reason ?? "Yahoo is not configured on the server");
    await consent(false, opts?.hint);
    // The account just connected is the server's latest one; the others stay connected.
    return call<Loaded>(`/providers/yahoo/messages${opts?.hint ? named(opts.hint) : ""}`);
  },
  async refresh(account) {
    return (await call<{ messages: MailMessage[] }>(`/providers/yahoo/messages${named(account.address)}`)).messages;
  },
  async enableSend(account) {
    await consent(true, account.address); // asks Yahoo again, now including mail-w
  },
  async send(account, r: OutgoingReply) {
    return call<{ message_id: string }>(`/providers/yahoo/send${named(account.address)}`, { method: "POST", body: JSON.stringify({ to: r.to, cc: r.cc, subject: r.subject, body: r.body, in_reply_to: r.in_reply_to.rfc822_id ?? null }) });
  },
  async restore() {
    return (await this.restoreAll?.())?.at(-1) ?? null;
  },
  // Every Yahoo session the server still holds for this browser.
  async restoreAll() {
    if (!api()) return [];
    try {
      const status = await call<{ accounts?: { email: string }[] }>("/providers/yahoo/status");
      const all = await Promise.all((status.accounts ?? []).map((a) => call<Loaded>(`/providers/yahoo/messages${named(a.email)}`).catch(() => null)));
      return all.filter((x): x is Loaded => !!x);
    } catch {
      return []; // no live server session: the person reconnects with one click
    }
  },
  async disconnect(account) {
    await call(`/providers/yahoo/disconnect${named(account.address)}`, { method: "POST" }).catch(() => undefined);
  },
};
