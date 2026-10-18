import { Bookmark, BellRing, CalendarClock, Flame, Forward, Hourglass, Info, ShieldAlert, Tag, Zap, type LucideIcon } from "lucide-react";
import { CATEGORY_LABEL, type Address, type Category, type MailAccount, type Priority } from "@c16/core";
import { Avatar, Badge, cn, type Tone } from "../../ui";

export const CATS: Category[] = ["urgent", "requires_action", "to_delegate", "meetings", "waiting", "follow_up", "important", "fyi", "promotions", "spam"];

/** One colour family per category, used for the row stripe, chips, dots and charts. */
export interface CatMeta {
  short: string;
  help: string; // what the category means, in one line
  icon: LucideIcon;
  hex: string; // charts
  dot: string;
  stripe: string;
  chip: string;
  solid: string;
  soft: string;
  text: string;
  border: string;
}
export const CAT: Record<Category, CatMeta> = {
  urgent: {
    short: "Urgent",
    help: "Deadlines within two days, escalations and blockers.",
    icon: Flame,
    hex: "#e5484d",
    dot: "bg-red-500",
    stripe: "bg-red-500",
    chip: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30",
    solid: "bg-red-600 text-white ring-red-600",
    soft: "bg-red-50/70 dark:bg-red-500/[0.07]",
    text: "text-red-600 dark:text-red-400",
    border: "border-l-red-500",
  },
  requires_action: {
    short: "Action",
    help: "Someone is waiting for you to do or answer something.",
    icon: Zap,
    hex: "#f76b15",
    dot: "bg-orange-500",
    stripe: "bg-orange-500",
    chip: "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/30",
    solid: "bg-orange-500 text-white ring-orange-500",
    soft: "bg-orange-50/70 dark:bg-orange-500/[0.07]",
    text: "text-orange-600 dark:text-orange-400",
    border: "border-l-orange-500",
  },
  to_delegate: {
    short: "Delegate",
    help: "Work that belongs to someone else, or still needs an owner.",
    icon: Forward,
    hex: "#8e4ec6",
    dot: "bg-purple-500",
    stripe: "bg-purple-500",
    chip: "bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-purple-500/30",
    solid: "bg-purple-600 text-white ring-purple-600",
    soft: "bg-purple-50/70 dark:bg-purple-500/[0.07]",
    text: "text-purple-600 dark:text-purple-400",
    border: "border-l-purple-500",
  },
  meetings: {
    short: "Meetings",
    help: "Meeting requests, invitations, reschedules and confirmations.",
    icon: CalendarClock,
    hex: "#0090ff",
    dot: "bg-sky-500",
    stripe: "bg-sky-500",
    chip: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30",
    solid: "bg-sky-600 text-white ring-sky-600",
    soft: "bg-sky-50/70 dark:bg-sky-500/[0.07]",
    text: "text-sky-600 dark:text-sky-400",
    border: "border-l-sky-500",
  },
  waiting: {
    short: "Waiting",
    help: "You asked; the reply has not come yet.",
    icon: Hourglass,
    hex: "#e2a336",
    dot: "bg-amber-400",
    stripe: "bg-amber-400",
    chip: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
    solid: "bg-amber-500 text-white ring-amber-500",
    soft: "bg-amber-50/70 dark:bg-amber-500/[0.07]",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-l-amber-400",
  },
  follow_up: {
    short: "Follow-up",
    help: "Promises and open loops to check on later.",
    icon: BellRing,
    hex: "#12a594",
    dot: "bg-teal-500",
    stripe: "bg-teal-500",
    chip: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-500/30",
    solid: "bg-teal-600 text-white ring-teal-600",
    soft: "bg-teal-50/70 dark:bg-teal-500/[0.07]",
    text: "text-teal-600 dark:text-teal-400",
    border: "border-l-teal-500",
  },
  important: {
    short: "Important",
    help: "Worth reading, but nothing is asked of you right now.",
    icon: Bookmark,
    hex: "#3e63dd",
    dot: "bg-indigo-500",
    stripe: "bg-indigo-500",
    chip: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30",
    solid: "bg-indigo-600 text-white ring-indigo-600",
    soft: "bg-indigo-50/70 dark:bg-indigo-500/[0.07]",
    text: "text-indigo-600 dark:text-indigo-400",
    border: "border-l-indigo-500",
  },
  fyi: {
    short: "FYI",
    help: "Updates and resolved conversations. No reply needed.",
    icon: Info,
    hex: "#8b8d98",
    dot: "bg-slate-400",
    stripe: "bg-slate-300 dark:bg-slate-600",
    chip: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-500/30",
    solid: "bg-slate-600 text-white ring-slate-600",
    soft: "bg-slate-50 dark:bg-slate-500/[0.07]",
    text: "text-slate-500 dark:text-slate-400",
    border: "border-l-slate-400",
  },
  promotions: {
    short: "Promotions",
    help: "Newsletters, offers and marketing. Never treated as spam.",
    icon: Tag,
    hex: "#30a46c",
    dot: "bg-emerald-500",
    stripe: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
    solid: "bg-emerald-600 text-white ring-emerald-600",
    soft: "bg-emerald-50/70 dark:bg-emerald-500/[0.07]",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-l-emerald-500",
  },
  spam: {
    short: "Spam",
    help: "Phishing, scams and emails that try to give instructions. Quarantined.",
    icon: ShieldAlert,
    hex: "#be123c",
    dot: "bg-rose-700",
    stripe: "bg-rose-700",
    chip: "bg-rose-100 text-rose-800 ring-rose-300 dark:bg-rose-500/20 dark:text-rose-200 dark:ring-rose-500/40",
    solid: "bg-rose-700 text-white ring-rose-700",
    soft: "bg-rose-50 dark:bg-rose-500/[0.08]",
    text: "text-rose-700 dark:text-rose-400",
    border: "border-l-rose-700",
  },
};
export const SHORT_LABEL: Record<Category, string> = Object.fromEntries(CATS.map((c) => [c, CAT[c].short])) as Record<Category, string>;
export const PRIORITY_TONE: Record<Priority, Tone> = { critical: "solidRed", high: "red", normal: "brand", low: "neutral" };
export const PRIORITY_ORDER: Priority[] = ["critical", "high", "normal", "low"];

/** A coloured category pill. `full` shows the long label. */
export function CategoryBadge({ category, full, className }: { category: Category; full?: boolean; className?: string }) {
  const m = CAT[category];
  const Icon = m.icon;
  return (
    <span title={m.help} className={cn("inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-semibold ring-1 ring-inset", m.chip, className)}>
      <Icon className="h-3 w-3" />
      {full ? CATEGORY_LABEL[category] : m.short}
    </span>
  );
}
export const CategoryDot = ({ category, className }: { category: Category; className?: string }) => <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", CAT[category].dot, className)} />;

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "normal" || priority === "low") return null;
  return (
    <Badge tone={PRIORITY_TONE[priority]} className="rounded-full">
      {priority === "critical" && <Flame className="h-3 w-3" />}
      {priority}
    </Badge>
  );
}

/* ---------- Providers ---------- */
const PROVIDER: Record<MailAccount["provider"], { label: string; letter: string; cls: string; ring: string }> = {
  gmail: { label: "Gmail", letter: "G", cls: "bg-[#EA4335]", ring: "ring-[#EA4335]/30" },
  outlook: { label: "Outlook", letter: "O", cls: "bg-[#0078D4]", ring: "ring-[#0078D4]/30" },
  yahoo: { label: "Yahoo", letter: "Y", cls: "bg-[#6001D2]", ring: "ring-[#6001D2]/30" },
  import: { label: "File", letter: "F", cls: "bg-slate-500", ring: "ring-slate-500/30" },
};
export const providerLabel = (p: MailAccount["provider"]) => PROVIDER[p].label;
export const providerColor = (p: MailAccount["provider"]) => PROVIDER[p].cls;

export function ProviderMark({ provider, size = "sm", className }: { provider: MailAccount["provider"]; size?: "md" | "sm" | "xs" | "badge"; className?: string }) {
  const p = PROVIDER[provider];
  const s = { md: "h-8 w-8 rounded-lg text-sm", sm: "h-6 w-6 rounded-md text-[11px]", xs: "h-4 w-4 rounded text-[9px]", badge: "h-3.5 w-3.5 rounded-[4px] text-[8px] leading-none" }[size];
  return (
    <span title={p.label} className={cn("grid shrink-0 place-items-center font-bold text-white", p.cls, s, className)}>
      {p.letter}
    </span>
  );
}

/** Sender avatar with the mailbox's provider in the corner, as in a unified inbox. */
export function SenderAvatar({ name, provider, size = "md" }: { name: string; provider?: MailAccount["provider"]; size?: "sm" | "md" | "lg" }) {
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar name={name} size={size} />
      {provider && <ProviderMark provider={provider} size="badge" className="absolute -bottom-1 -right-1 ring-2 ring-surface" />}
    </span>
  );
}

/** Badge colour presets for companies; a company without a chosen colour gets a stable one from its name. */
const COMPANY_COLORS: Record<string, string> = {
  blue: "bg-blue-50 text-blue-800 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-200 dark:ring-blue-500/30",
  violet: "bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-500/30",
  emerald: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/30",
  amber: "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30",
  rose: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:ring-rose-500/30",
  teal: "bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-500/15 dark:text-teal-200 dark:ring-teal-500/30",
  orange: "bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-200 dark:ring-orange-500/30",
  slate: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-500/15 dark:text-slate-200 dark:ring-slate-500/30",
};
const PRESET_NAMES = Object.keys(COMPANY_COLORS);
export function companyTone(company: string, color?: string) {
  if (color && COMPANY_COLORS[color]) return COMPANY_COLORS[color];
  const h = [...company.toLowerCase()].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  return COMPANY_COLORS[PRESET_NAMES[h % PRESET_NAMES.length]];
}
/** The company or workspace a mailbox belongs to, as a small coloured pill. */
export function CompanyBadge({ account, className }: { account: Pick<MailAccount, "company" | "color">; className?: string }) {
  if (!account.company) return null;
  return <span title={`Company: ${account.company}`} className={cn("inline-flex h-5 max-w-[10rem] items-center truncate whitespace-nowrap rounded-full px-2 text-[11px] font-medium ring-1 ring-inset", companyTone(account.company, account.color), className)}>{account.company}</span>;
}
/** "Fynd Retail · riya@fynd.com", for places that show only text. */
export const accountTitle = (a: Pick<MailAccount, "company" | "address">) => (a.company ? `${a.company} · ${a.address}` : a.address);

export const accountNote = (a: MailAccount) => (a.mode === "demo" ? "Demo data" : a.mode === "import" ? "Imported file" : a.send_enabled ? "Connected" : "Connected · read-only");

export const nameOf = (a: Address) => a.name || a.email;
export const firstName = (a: Address) => nameOf(a).split(/[\s(]/)[0];

/* ---------- Time ---------- */
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
/** YYYY-MM-DD of an instant in a zone. */
export function ymdIn(iso: string | number, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString().slice(0, 10);
  }
}
const dayDiff = (iso: string, nowIso: string, tz: string) => Math.round((Date.parse(ymdIn(nowIso, tz)) - Date.parse(ymdIn(iso, tz))) / 86_400_000);
/** Gmail-style list time: "09:30" today, "16 Oct" this year, "16/10/25" before. */
export function listTime(iso: string, nowIso: string, tz: string) {
  const d = dayDiff(iso, nowIso, tz);
  if (d === 0) return localTime(iso, tz, { hour: "2-digit", minute: "2-digit" });
  if (ymdIn(iso, tz).slice(0, 4) === ymdIn(nowIso, tz).slice(0, 4)) return localTime(iso, tz, { day: "numeric", month: "short" });
  return localTime(iso, tz, { day: "2-digit", month: "2-digit", year: "2-digit" });
}
export type DayBucket = "Today" | "Yesterday" | "Earlier this week" | "Older";
export function dayBucket(iso: string, nowIso: string, tz: string): DayBucket {
  const d = dayDiff(iso, nowIso, tz);
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : d < 7 ? "Earlier this week" : "Older";
}
/** "3 hours ago", "2 days ago". */
export function ago(iso: string, nowIso: string) {
  const mins = Math.round((Date.parse(nowIso) - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
}

/** A date and time stated in an email (with its offset) as an ISO instant. */
export function whenIso(date: string, time: string, offsetMin: number) {
  const a = Math.abs(offsetMin);
  return `${date}T${time}:00${offsetMin >= 0 ? "+" : "-"}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}
/** Minutes since midnight of an instant in a zone. */
export function minutesIn(iso: string | number, timeZone: string) {
  try {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
    return Number(p.find((x) => x.type === "hour")!.value) * 60 + Number(p.find((x) => x.type === "minute")!.value);
  } catch {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
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
