import { CATEGORY_LABEL, type Address, type Category, type MailAccount, type Priority } from "@c16/core";
import { Badge, cn, type Tone } from "../../ui";

export const CATS: Category[] = ["urgent", "requires_action", "to_delegate", "meetings", "waiting", "follow_up", "important", "fyi", "promotions", "spam"];
export const CAT_TONE: Record<Category, Tone> = { urgent: "red", requires_action: "brand", to_delegate: "amber", meetings: "blue", waiting: "violet", important: "amber", follow_up: "amber", fyi: "neutral", promotions: "green", spam: "solidRed" };
export const CAT_DOT: Record<Category, string> = { urgent: "bg-rose-500", requires_action: "bg-indigo-500", to_delegate: "bg-amber-500", meetings: "bg-sky-500", waiting: "bg-violet-500", important: "bg-amber-400", follow_up: "bg-orange-500", fyi: "bg-slate-400", promotions: "bg-emerald-500", spam: "bg-red-700" };
export const PRIORITY_TONE: Record<Priority, Tone> = { critical: "solidRed", high: "red", normal: "brand", low: "neutral" };
export const SHORT_LABEL: Record<Category, string> = { ...CATEGORY_LABEL, meetings: "Meetings", promotions: "Promotions", spam: "Spam", waiting: "Waiting", follow_up: "Follow-up" };

const PROVIDER: Record<MailAccount["provider"], { label: string; letter: string; cls: string }> = {
  gmail: { label: "Gmail", letter: "G", cls: "bg-rose-500" },
  outlook: { label: "Outlook", letter: "O", cls: "bg-sky-600" },
  yahoo: { label: "Yahoo", letter: "Y", cls: "bg-violet-600" },
  import: { label: "File", letter: "F", cls: "bg-slate-500" },
};
export const providerLabel = (p: MailAccount["provider"]) => PROVIDER[p].label;

export function ProviderMark({ provider, size = "sm" }: { provider: MailAccount["provider"]; size?: "sm" | "xs" }) {
  const p = PROVIDER[provider];
  return <span className={cn("grid shrink-0 place-items-center rounded-md font-bold text-white", p.cls, size === "sm" ? "h-6 w-6 text-[11px]" : "h-4 w-4 text-[9px]")}>{p.letter}</span>;
}

export const accountNote = (a: MailAccount) => (a.mode === "demo" ? "Demo data" : a.mode === "import" ? "Imported file" : a.send_enabled ? "Connected" : "Connected · read-only");

export function CategoryBadge({ category }: { category: Category }) {
  return <Badge tone={CAT_TONE[category]}>{SHORT_LABEL[category]}</Badge>;
}

export const nameOf = (a: Address) => a.name || a.email;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-16T09:00:00+05:30" → "16 Oct, 09:00" in the timestamp's own zone. */
export const shortTime = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}, ${iso.slice(11, 16)}`;
/** A timestamp shown in the user's zone. */
export function localTime(iso: string, timeZone: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) {
  try {
    return new Intl.DateTimeFormat("en-IN", { timeZone, ...opts }).format(new Date(iso));
  } catch {
    return shortTime(iso);
  }
}

export const addrText = (a: Address[]) => a.map((x) => (x.name ? `${x.name} <${x.email}>` : x.email)).join(", ");
export const addrList = (s: string): Address[] =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const m = /^(.*?)\s*<([^>]+)>$/.exec(x);
      return m ? { name: m[1] || undefined, email: m[2] } : { email: x };
    });
