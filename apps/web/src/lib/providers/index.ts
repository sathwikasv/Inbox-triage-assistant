import type { Provider } from "@c16/core";
import { gmail, googleCalendar } from "./google";
import { outlook, outlookCalendar } from "./microsoft";
import { yahoo } from "./yahoo";
import type { CalendarProviderClient, MailProviderClient } from "./types";

export * from "./types";
export { linkServerGmail, serverGmailLinked } from "./google";

export const MAIL_PROVIDERS: Partial<Record<Provider, MailProviderClient>> = { gmail, outlook, yahoo };
export const CALENDAR_PROVIDERS: Record<"google" | "outlook", CalendarProviderClient> = { google: googleCalendar, outlook: outlookCalendar };
