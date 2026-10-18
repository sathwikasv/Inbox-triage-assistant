import { useState, type ReactNode } from "react";
import { create } from "zustand";
import * as DG from "@radix-ui/react-dialog";
import { Bell, CalendarDays, Check, Clock, Inbox, Loader2, Lock, Sparkles, X } from "lucide-react";
import { useAuth } from "../store/auth";
import { useApp } from "../store/app";
import { useMailbox } from "../store/mailbox";
import { useAssistant } from "../store/assistant";
import { CALENDAR_PROVIDERS, MAIL_PROVIDERS } from "../lib/providers";
import { ProviderMark } from "./mail/common";
import { cn } from "../ui";

/** Reopen the setup guide from anywhere (the account menu). */
export const useSetupGuide = create<{ open: boolean; show(): void; hide(): void }>((set) => ({ open: false, show: () => set({ open: true }), hide: () => set({ open: false }) }));

const ZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney", "UTC"];

function Step({ n, done, icon, title, text, children }: { n: number; done: boolean; icon: ReactNode; title: string; text: string; children: ReactNode }) {
  return (
    <li className="flex gap-4 py-4">
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold", done ? "bg-emerald-500 text-white" : "bg-brand-soft text-brand")}>{done ? <Check className="h-4 w-4" /> : n}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-semibold">
          <span className="text-muted [&>svg]:h-4 [&>svg]:w-4">{icon}</span> {title}
        </div>
        <p className="mt-0.5 text-sm text-muted">{text}</p>
        <div className="mt-3">{children}</div>
      </div>
    </li>
  );
}

/** Shown once, the first time a new account reaches the dashboard: connect what Triagedesk needs. */
export function OnboardingDialog() {
  const { user, update } = useAuth();
  const guide = useSetupGuide();
  const { connect, connectCalendar, busy, connected, calendars } = useMailbox();
  const a = useAssistant();
  const { prefs } = useApp();
  const [later, setLater] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const open = !!user && ((!user.onboarding_completed && !later) || guide.open);
  if (!open || !user) return null;

  const mailDone = connected.length > 0;
  const calDone = calendars.length > 0;
  const steps = [mailDone, calDone, a.enabled, a.notify];
  const done = steps.filter(Boolean).length;
  const close = () => {
    setLater(true);
    guide.hide();
  };
  const finish = async () => {
    setFinishing(true);
    await update({ onboarding_completed: true });
    setFinishing(false);
    guide.hide();
  };

  return (
    <DG.Root open onOpenChange={(o) => !o && close()}>
      <DG.Portal>
        <DG.Overlay className="fixed inset-0 z-40 bg-nav/50 backdrop-blur-[2px]" />
        <DG.Content className="fixed left-1/2 top-[5vh] z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 animate-fade-in overflow-y-auto rounded-3xl border border-line bg-surface shadow-pop">
          <div className="relative overflow-hidden bg-gradient-to-br from-brand-soft via-surface to-surface px-6 pb-5 pt-6">
            <DG.Close asChild>
              <button className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-fg/[0.06]" aria-label="Close the setup guide">
                <X className="h-4 w-4" />
              </button>
            </DG.Close>
            <DG.Title className="text-2xl font-semibold tracking-tight">Welcome, {user.name.split(" ")[0]}! Let's set up your inbox</DG.Title>
            <DG.Description className="mt-1 text-sm text-muted">Connect what Triagedesk should work with. Each one signs in on the provider's own page, and you can change any of it later in Settings.</DG.Description>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-subtle">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
              </div>
              <span className="text-xs font-medium text-muted">
                {done} of {steps.length} done
              </span>
            </div>
          </div>

          <ol className="divide-y divide-line px-6">
            <Step n={1} done={mailDone} icon={<Inbox />} title="Connect your mailboxes" text="Gmail, Outlook or Yahoo Mail. Read-only until you allow sending; your password is never typed here.">
              <div className="grid gap-2 sm:grid-cols-3">
                {(["gmail", "outlook", "yahoo"] as const).map((p) => {
                  const client = MAIL_PROVIDERS[p]!;
                  const need = client.setupNeeded();
                  const acc = connected.find((c) => c.account.provider === p);
                  return (
                    <button
                      key={p}
                      disabled={!!acc || !!need || busy[`connect:${p}`]}
                      onClick={() => connect(p)}
                      title={need ?? undefined}
                      className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition", acc ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-line hover:border-brand/50 hover:shadow-card disabled:opacity-50")}
                    >
                      {busy[`connect:${p}`] ? <Loader2 className="h-5 w-5 animate-spin" /> : <ProviderMark provider={p} size="sm" />}
                      <span className="min-w-0">
                        <span className="block font-semibold">{client.label}</span>
                        <span className="block truncate text-xs text-muted">{acc ? acc.account.address : need ? "Not set up on this site" : "Connect"}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Step>

            <Step n={2} done={calDone} icon={<CalendarDays />} title="Connect your calendar (optional)" text="So meeting requests show clashes and land in your real calendar after you accept them.">
              <div className="flex flex-wrap gap-2">
                {(["google", "outlook"] as const).map((c) => {
                  const client = CALENDAR_PROVIDERS[c];
                  const need = client.setupNeeded();
                  const link = calendars.find((x) => x.calendar === c);
                  return (
                    <button key={c} disabled={!!link || !!need || busy[`calendar:${c}`]} onClick={() => connectCalendar(c)} title={need ?? undefined} className={cn("inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition", link ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-line hover:bg-subtle disabled:opacity-50")}>
                      {busy[`calendar:${c}`] ? <Loader2 className="h-4 w-4 animate-spin" /> : link ? <Check className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />} {client.label}
                    </button>
                  );
                })}
              </div>
            </Step>

            <Step n={3} done={a.enabled} icon={<Sparkles />} title="Turn on the AI assistant" text="It reads the conversations that need you, summarises them and drafts replies for your review. It never sends anything.">
              {a.status.available ? (
                <label className="inline-flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={a.enabled} onChange={(e) => a.setEnabled(e.target.checked)} /> Let the assistant read and draft
                </label>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                  <Lock className="h-3.5 w-3.5" /> Not available on this site yet (no model key on the server).
                </span>
              )}
            </Step>

            <Step n={4} done={a.notify} icon={<Bell />} title="Get notified when something needs you" text="A desktop notification when an email needs your review: money, legal terms, a clash, a suspicious message.">
              <label className="inline-flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={a.notify} onChange={(e) => a.setNotify(e.target.checked)} /> Desktop notifications
              </label>
            </Step>

            <Step n={5} done icon={<Clock />} title="Your time zone" text="Deadlines and meeting times are shown in it.">
              <select
                value={prefs.timezone}
                onChange={(e) => update({ timezone: e.target.value })}
                className="h-10 rounded-xl border border-line bg-surface px-3 text-sm"
                aria-label="Time zone"
              >
                {[...new Set([prefs.timezone, ...ZONES])].map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </Step>
          </ol>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">
            <button onClick={close} className="rounded-full px-4 py-2 text-sm font-medium text-muted hover:bg-fg/[0.06]">
              I'll do this later
            </button>
            <button onClick={finish} disabled={finishing} className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-brand-fg hover:bg-brand/90 disabled:opacity-50">
              {finishing && <Loader2 className="h-4 w-4 animate-spin" />} Go to my dashboard
            </button>
          </div>
        </DG.Content>
      </DG.Portal>
    </DG.Root>
  );
}
