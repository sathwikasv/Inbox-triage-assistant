import type { Provider } from "@c16/core";
import { gmail, googleCalendar } from "./google";
import { yahoo } from "./yahoo";
import type { CalendarProviderClient, MailProviderClient } from "./types";

export * from "./types";
export { calendarProblem, linkServerGmail, serverGmailAccounts, serverGmailLinked } from "./google";

export const MAIL_PROVIDERS: Partial<Record<Provider, MailProviderClient>> = { gmail, yahoo };
export const CALENDAR_PROVIDERS: Record<"google", CalendarProviderClient> = { google: googleCalendar };
