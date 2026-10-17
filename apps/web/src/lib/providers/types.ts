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
  connect(): Promise<{ account: MailAccount; messages: MailMessage[] }>;
  refresh(account: MailAccount): Promise<MailMessage[]>;
  /** Asks the user for send permission separately from read access. */
  enableSend(account: MailAccount): Promise<void>;
  send(account: MailAccount, reply: OutgoingReply): Promise<{ message_id: string }>;
  disconnect(account: MailAccount): Promise<void>;
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
  calendar: "google" | "outlook";
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

export function htmlToText(h: string): string {
  return (
    new DOMParser()
      .parseFromString(h.replace(/<(br|\/p|\/div|\/li|\/tr)>/gi, "\n$&"), "text/html")
      .body.textContent?.replace(/\n{3,}/g, "\n\n")
      .trim() ?? ""
  );
}

/** Settings a person enters once (OAuth client IDs are public identifiers, not secrets). */
export const CONFIG_KEYS = { google: "c16.google_client_id", microsoft: "c16.ms_client_id", api: "c16.api_url" } as const;

export function setting(key: keyof typeof CONFIG_KEYS): string {
  const env = { google: import.meta.env.VITE_GOOGLE_CLIENT_ID, microsoft: import.meta.env.VITE_MS_CLIENT_ID, api: import.meta.env.VITE_API_URL }[key] as string | undefined;
  try {
    return localStorage.getItem(CONFIG_KEYS[key]) || env || "";
  } catch {
    return env || "";
  }
}

export function saveSetting(key: keyof typeof CONFIG_KEYS, value: string) {
  try {
    if (value) localStorage.setItem(CONFIG_KEYS[key], value);
    else localStorage.removeItem(CONFIG_KEYS[key]);
  } catch {
    /* not kept */
  }
}
