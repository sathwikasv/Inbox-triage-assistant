import type { Address, CalendarEvent, MailAccount, MailMessage, Provider } from "@c16/core";

/**
 * One interface per mail provider, so each integration is built and tested on its own. Every method talks
 * to the provider's official API with OAuth 2.0; none of them ever asks for an email password.
 */
export interface MailProviderClient {
  provider: Provider;
  label: string;
  /** Why it cannot be used yet (missing client ID, server not set up), or null when ready. */
  setupNeeded(): string | null;
  /** Signs an account in. Gmail always shows Google's account chooser, so a second or third account can be added; `hint` pre-selects a known address (reconnecting). */
  connect(opts?: ConnectOptions): Promise<{ account: MailAccount; messages: MailMessage[] }>;
  refresh(account: MailAccount): Promise<MailMessage[]>;
  /** Asks the user for send permission separately from read access. */
  enableSend(account: MailAccount): Promise<void>;
  send(account: MailAccount, reply: OutgoingReply): Promise<{ message_id: string }>;
  disconnect(account: MailAccount): Promise<void>;
  /** Resumes a session the provider still holds (no popup), or null. Only where a server keeps the session. */
  restore?(): Promise<{ account: MailAccount; messages: MailMessage[] } | null>;
  /** Resumes every account the provider or server still holds (several Yahoo sessions, every Gmail linked to the login). */
  restoreAll?(): Promise<{ account: MailAccount; messages: MailMessage[] }[]>;
}

export interface ConnectOptions {
  hint?: string;
}

export interface OutgoingReply {
  to: Address[];
  cc: Address[];
  subject: string;
  body: string;
  in_reply_to: MailMessage; // the email being answered (for threading)
}

/** Calendars are connected separately: connecting mail never grants calendar access. */
export interface CalendarProviderClient {
  calendar: "google";
  label: string;
  setupNeeded(): string | null;
  connect(): Promise<{ address: string; events: CalendarEvent[] }>;
  list(): Promise<CalendarEvent[]>;
  create(e: Omit<CalendarEvent, "id" | "calendar" | "simulated">): Promise<CalendarEvent>;
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");

/** Local ISO with the browser's own offset, as the triage engine expects. */
export function isoWithOffset(ms: number): string {
  const d = new Date(ms);
  const off = -d.getTimezoneOffset();
  const local = new Date(ms + off * 60_000).toISOString().slice(0, 19);
  return `${local}${off < 0 ? "-" : "+"}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}

/** Readable text from an HTML email: block elements become line breaks, images and styles are dropped. */
export function htmlToText(h: string): string {
  const doc = new DOMParser().parseFromString(h, "text/html");
  doc.querySelectorAll("style, script, head, title, img, svg, noscript").forEach((n) => n.remove());
  doc.querySelectorAll("li").forEach((n) => n.prepend("• "));
  doc.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
  doc.querySelectorAll("p, div, li, tr, h1, h2, h3, h4, h5, h6, table, blockquote, section, article, header, footer").forEach((n) => n.append("\n"));
  return tidyText(doc.body?.textContent ?? "");
}

/** Plain-text bodies: no "[image: …]" placeholders, no layout indentation, at most one blank line in a row. */
export function tidyText(t: string): string {
  return t
    .replace(/\r\n?/g, "\n")
    .replace(/\[image:[^\]]*\]/gi, "")
    .replace(/\u00a0|\u200b|\u200c|\u200d|\ufeff/g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** HTML kept for display only (in memory), capped so a huge newsletter cannot slow the app down. */
export const keepHtml = (h: string) => (h && h.length <= 300_000 ? h : undefined);

/** Settings a person enters once (OAuth client IDs are public identifiers, not secrets). */
export const CONFIG_KEYS = { google: "c16.google_client_id", api: "c16.api_url" } as const;

export function setting(key: keyof typeof CONFIG_KEYS): string {
  const env = { google: import.meta.env.VITE_GOOGLE_CLIENT_ID, api: import.meta.env.VITE_API_URL }[key] as string | undefined;
  let v: string;
  try {
    v = localStorage.getItem(CONFIG_KEYS[key]) || env || "";
  } catch {
    v = env || "";
  }
  // A path such as "/api" means the server is on this site's own domain (the Vercel deployment).
  return key === "api" && v.startsWith("/") ? `${window.location.origin}${v.replace(/\/$/, "")}` : v;
}

/** True once any real provider or the server is configured: the app then works on real mail, not demo data. */
export const providersConfigured = () => !!(setting("google") || setting("api"));

export function saveSetting(key: keyof typeof CONFIG_KEYS, value: string) {
  try {
    if (value) localStorage.setItem(CONFIG_KEYS[key], value);
    else localStorage.removeItem(CONFIG_KEYS[key]);
  } catch {
    /* not kept */
  }
}
