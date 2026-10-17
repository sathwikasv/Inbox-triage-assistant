import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { clsx } from "clsx";
import * as RT from "@radix-ui/react-tooltip";
import * as DM from "@radix-ui/react-dropdown-menu";
import * as DG from "@radix-ui/react-dialog";
import { Check, ChevronRight, X } from "lucide-react";
import type { NextActionKind, Purpose, TaskStatus, Urgency } from "@c16/core";

export const cn = clsx;

/* ---------- Button ---------- */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "dark";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-brand-fg hover:bg-brand/90 shadow-sm",
  secondary: "border border-line bg-surface text-fg hover:bg-subtle shadow-sm",
  ghost: "text-muted hover:bg-subtle hover:text-fg",
  danger: "bg-rose-600 text-white hover:bg-rose-500 shadow-sm",
  success: "bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm",
  dark: "bg-fg text-surface hover:bg-fg/90 shadow-sm",
};
const SIZES = { xs: "h-7 px-2 text-xs gap-1", sm: "h-8 px-2.5 text-sm gap-1.5", md: "h-9 px-3.5 text-sm gap-2", icon: "h-8 w-8 justify-center" };

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZES }>(function Button(
  { variant = "secondary", size = "sm", className, ...p },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn("inline-flex shrink-0 items-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45", VARIANTS[variant], SIZES[size], className)}
      {...p}
    />
  );
});

/* ---------- Badge ---------- */
export type Tone = "neutral" | "brand" | "red" | "amber" | "green" | "blue" | "violet" | "solidRed";
const TONES: Record<Tone, string> = {
  neutral: "bg-fg/[0.05] text-muted ring-fg/10",
  brand: "bg-brand/10 text-brand ring-brand/20",
  red: "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300",
  amber: "bg-amber-500/10 text-amber-800 ring-amber-500/25 dark:text-amber-300",
  green: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300",
  blue: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300",
  violet: "bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300",
  solidRed: "bg-rose-600 text-white ring-rose-600",
};
export function Badge({ tone = "neutral", children, className, title, dot }: { tone?: Tone; children: ReactNode; className?: string; title?: string; dot?: boolean }) {
  return (
    <span title={title} className={cn("inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11px] font-medium ring-1 ring-inset", TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ---------- Avatar ---------- */
const AVATAR = ["bg-indigo-500", "bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-violet-500", "bg-teal-500", "bg-fuchsia-500"];
export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const hash = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const id = /^[A-Z]{1,2}(\d{1,3})$/.exec(name); // email ids such as E01 show their number
  const initials = id ? id[1] : name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const s = { sm: "h-6 w-6 text-[10px]", md: "h-8 w-8 text-xs", lg: "h-10 w-10 text-sm" }[size];
  return <span className={cn("grid shrink-0 place-items-center rounded-full font-semibold text-white", AVATAR[hash % AVATAR.length], s, className)}>{initials}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-subtle px-1.5 py-px font-mono text-[10px] font-medium text-muted">{children}</kbd>;
}

/* ---------- Tooltip ---------- */
export function Tip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <RT.Root delayDuration={250}>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content side={side} sideOffset={6} className="z-50 max-w-xs animate-fade-in rounded-md bg-nav px-2 py-1 text-xs text-white shadow-pop">
          {content}
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}
export const TipProvider = RT.Provider;

/* ---------- Dropdown menu ---------- */
export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;
export function MenuContent({ children, align = "end" }: { children: ReactNode; align?: "start" | "end" }) {
  return (
    <DM.Portal>
      <DM.Content align={align} sideOffset={6} className="z-50 min-w-[13rem] animate-fade-in rounded-xl border border-line bg-surface p-1 shadow-pop">
        {children}
      </DM.Content>
    </DM.Portal>
  );
}
export function MenuItem({ icon, children, onSelect, disabled, danger, hint }: { icon?: ReactNode; children: ReactNode; onSelect?: () => void; disabled?: boolean; danger?: boolean; hint?: ReactNode }) {
  return (
    <DM.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm outline-none data-[disabled]:cursor-not-allowed data-[highlighted]:bg-subtle data-[disabled]:opacity-40",
        danger ? "text-rose-600" : "text-fg",
      )}
    >
      <span className="text-muted [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <span className="flex-1">{children}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </DM.Item>
  );
}
export function MenuSub({ icon, label, children }: { icon?: ReactNode; label: ReactNode; children: ReactNode }) {
  return (
    <DM.Sub>
      <DM.SubTrigger className="flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-subtle data-[state=open]:bg-subtle">
        <span className="text-muted [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="flex-1">{label}</span>
        <ChevronRight className="h-4 w-4 text-muted" />
      </DM.SubTrigger>
      <DM.Portal>
        <DM.SubContent sideOffset={6} className="z-50 min-w-[11rem] animate-fade-in rounded-xl border border-line bg-surface p-1 shadow-pop">
          {children}
        </DM.SubContent>
      </DM.Portal>
    </DM.Sub>
  );
}
export function MenuCheck({ checked, children, onSelect }: { checked: boolean; children: ReactNode; onSelect: () => void }) {
  return (
    <DM.Item onSelect={onSelect} className="flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-subtle">
      <span className="w-4">{checked && <Check className="h-4 w-4 text-brand" />}</span>
      {children}
    </DM.Item>
  );
}
export const MenuSep = () => <DM.Separator className="my-1 h-px bg-line" />;
export const MenuLabel = ({ children }: { children: ReactNode }) => <DM.Label className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{children}</DM.Label>;

/* ---------- Dialog ---------- */
export function Dialog({ open, onOpenChange, title, description, children, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <DG.Root open={open} onOpenChange={onOpenChange}>
      <DG.Portal>
        <DG.Overlay className="fixed inset-0 z-40 bg-nav/40 backdrop-blur-[2px]" />
        <DG.Content className={cn("fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] -translate-x-1/2 animate-fade-in rounded-2xl border border-line bg-surface p-5 shadow-pop", wide ? "max-w-2xl" : "max-w-md")}>
          <div className="mb-4 flex items-start gap-3">
            <div className="flex-1">
              <DG.Title className="text-base font-semibold">{title}</DG.Title>
              {description && <DG.Description className="mt-1 text-sm text-muted">{description}</DG.Description>}
            </div>
            <DG.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </DG.Close>
          </div>
          {children}
        </DG.Content>
      </DG.Portal>
    </DG.Root>
  );
}

/* ---------- Misc ---------- */
export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand [&>svg]:h-6 [&>svg]:w-6">{icon}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-subtle p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn("inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium", value === o.value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Domain badges ---------- */
export const PURPOSE_LABEL: Record<Purpose, string> = {
  request: "Request",
  correction: "Correction",
  resolution: "Resolution",
  duplicate: "Duplicate",
  status_update: "Status update",
  fyi: "FYI",
  commitment: "Commitment",
  question: "Question",
  blocker: "Blocker",
  injection: "Injection",
};
const PURPOSE_TONE: Record<Purpose, Tone> = {
  request: "brand",
  correction: "violet",
  resolution: "green",
  duplicate: "neutral",
  status_update: "blue",
  fyi: "neutral",
  commitment: "blue",
  question: "amber",
  blocker: "red",
  injection: "solidRed",
};
export const PurposeBadge = ({ purpose }: { purpose: Purpose }) => <Badge tone={PURPOSE_TONE[purpose]}>{PURPOSE_LABEL[purpose]}</Badge>;

const URG: Record<Urgency, { tone: Tone; label: string }> = {
  high: { tone: "red", label: "High" },
  medium: { tone: "amber", label: "Medium" },
  low: { tone: "neutral", label: "Low" },
  "n/a": { tone: "neutral", label: "n/a" },
};
export const UrgencyBadge = ({ urgency }: { urgency: Urgency }) => (
  <Badge tone={URG[urgency].tone} dot>
    {URG[urgency].label}
  </Badge>
);

const STATUS: Record<TaskStatus, { tone: Tone; label: string }> = {
  open: { tone: "blue", label: "Open" },
  in_progress: { tone: "violet", label: "In progress" },
  blocked: { tone: "red", label: "Blocked" },
  closed: { tone: "green", label: "Resolved" },
  quarantined: { tone: "solidRed", label: "Quarantined" },
  needs_review: { tone: "amber", label: "Needs review" },
};
export const StatusBadge = ({ status }: { status: TaskStatus }) => <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>;

export function AgeBadge({ days }: { days: number | null }) {
  if (days === null) return <Badge>age ?</Badge>;
  const [label, cls] =
    days <= 1
      ? ["0–1 days", "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"]
      : days <= 5
        ? ["2–5 days", "bg-sky-500/15 text-sky-700 dark:text-sky-300"]
        : days <= 15
          ? ["6–15 days", "bg-amber-500/20 text-amber-800 dark:text-amber-300"]
          : ["16+ days", "bg-rose-500/15 text-rose-700 dark:text-rose-300"];
  return <span className={cn("inline-flex h-5 items-center whitespace-nowrap rounded-md px-1.5 text-[11px] font-semibold", cls)}>{label}</span>;
}

export const ACTION_META: Record<NextActionKind, { tone: Tone; stripe: string; label: string }> = {
  escalate: { tone: "red", stripe: "bg-rose-500", label: "Escalate" },
  review: { tone: "amber", stripe: "bg-amber-400", label: "Review" },
  reply: { tone: "brand", stripe: "bg-brand", label: "Reply" },
  watch: { tone: "blue", stripe: "bg-sky-400", label: "Watch" },
  archive: { tone: "neutral", stripe: "bg-fg/20", label: "Archive" },
};
