import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Lock, Plus, RefreshCw, ShieldCheck, Sparkles, X } from "lucide-react";
import { useMailbox } from "../store/mailbox";
import { useAssistant } from "../store/assistant";
import { MAIL_PROVIDERS } from "../lib/providers";
import { ProviderMark } from "./mail/common";
import { Button, cn } from "../ui";

/**
 * Add mailboxes. Gmail and Yahoo accounts from different companies can all be connected at once:
 * "Connect other Gmail account" always opens Google's account chooser, and nothing is disabled just because
 * one account is already connected. Each signs in on the provider's own page; no password is typed here.
 */
export function ConnectTiles({ withCompany, compact }: { withCompany?: boolean; compact?: boolean }) {
  const { connect, busy, connected } = useMailbox();
  const [company, setCompany] = useState("");
  const count = (p: "gmail" | "yahoo") => connected.filter((c) => c.account.provider === p).length;
  const tiles = [
    { id: "gmail-first", p: "gmail" as const, title: "Connect Gmail", sub: count("gmail") ? `${count("gmail")} connected` : "Google or Workspace account" },
    { id: "gmail-other", p: "gmail" as const, title: "Connect other Gmail account", sub: "Another company or personal Gmail" },
    { id: "yahoo", p: "yahoo" as const, title: count("yahoo") ? "Add another Yahoo Mail" : "Connect Yahoo Mail", sub: count("yahoo") ? `${count("yahoo")} connected` : "Opens a secure sign-in window" },
  ];
  return (
    <div>
      {withCompany && (
        <label className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Company or label</span>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            maxLength={80}
            placeholder="Optional, e.g. Fynd Retail, Client B, Personal"
            aria-label="Company or label for the next account"
            className="h-9 min-w-[14rem] flex-1 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-brand/60"
          />
        </label>
      )}
      <div className={cn("grid gap-2", compact ? "sm:grid-cols-3" : "sm:grid-cols-3")}>
        {tiles.map((t) => {
          const client = MAIL_PROVIDERS[t.p]!;
          const need = client.setupNeeded();
          const working = busy[`connect:${t.p}`];
          return (
            <button
              key={t.id}
              disabled={!!need || working}
              onClick={() => connect(t.p, { company: company || undefined })}
              title={need ?? `Sign in to ${client.label} (read access first; sending is asked for separately)`}
              className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-left transition hover:border-brand/50 hover:shadow-card disabled:cursor-not-allowed disabled:opacity-50"
            >
              {working ? <Loader2 className="h-6 w-6 animate-spin text-muted" /> : t.id === "gmail-other" ? <Plus className="h-6 w-6 text-brand" /> : <ProviderMark provider={t.p} size="sm" />}
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{t.title}</span>
                <span className="block truncate text-xs text-muted">{need ? "Not set up yet" : t.sub}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Connect your mailboxes, as a card. */
export function ConnectMailboxes({ compact }: { compact?: boolean }) {
  const missing = (["gmail", "yahoo"] as const).filter((p) => MAIL_PROVIDERS[p]!.setupNeeded());
  return (
    <div className={cn("rounded-2xl border border-line bg-surface shadow-card", compact ? "p-4" : "p-6")}>
      {!compact && (
        <>
          <h2 className="text-lg font-semibold">Connect your mailboxes</h2>
          <p className="mt-1 text-sm text-muted">Add as many Gmail and Yahoo accounts as you have, from any company. Each signs in on its provider's own page. Mail is read-only until you allow sending, and nothing is ever sent without your confirmation.</p>
        </>
      )}
      <div className={cn(!compact && "mt-4")}>
        <ConnectTiles withCompany={!compact} compact={compact} />
      </div>
      {missing.length > 0 && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {missing.map((p) => MAIL_PROVIDERS[p]!.label).join(", ")} {missing.length === 1 ? "needs" : "need"} the app ID in the repo-root <code className="font-mono">.env</code> (see <code className="font-mono">.env.example</code>) or under{" "}
            <Link to="/settings?s=integrations" className="text-brand hover:underline">
              Settings → Integrations
            </Link>
            .
          </span>
        </p>
      )}
    </div>
  );
}

/** After a reload, Gmail accounts need one click to sign in again (their tokens are never stored). */
export function ReconnectBar() {
  const { known, connected, connect, busy } = useMailbox();
  const missing = known.filter((k) => !connected.some((c) => c.account.provider === k.provider && c.account.address === k.address) && !MAIL_PROVIDERS[k.provider]?.setupNeeded());
  if (!missing.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-sky-200 bg-sky-50 px-4 py-2 text-xs text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100">
      <RefreshCw className="h-3.5 w-3.5 shrink-0" />
      <span>Sign in again to load your mail. Access tokens are never stored.</span>
      {missing.map((k) => (
        <button
          key={k.provider + k.address}
          onClick={() => connect(k.provider, { hint: k.address, company: k.company })}
          disabled={busy[`connect:${k.provider}`]}
          className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 font-medium shadow-card hover:shadow-pop disabled:opacity-60"
        >
          {busy[`connect:${k.provider}`] ? <Loader2 className="h-3 w-3 animate-spin" /> : <ProviderMark provider={k.provider} size="xs" />} {k.address}
        </button>
      ))}
    </div>
  );
}

/** Asks once whether the AI assistant may read conversations, when the server has a model. */
export function AssistantOffer() {
  const { enabled, status, offerDismissed, setEnabled, dismissOffer } = useAssistant();
  if (enabled || !status.available || offerDismissed) return null;
  return (
    <div className="relative flex flex-wrap items-center gap-3 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 via-surface to-surface px-4 py-3 shadow-card dark:border-violet-500/30 dark:from-violet-500/10">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-600 text-white">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-semibold">The AI assistant is ready</div>
        <div className="text-xs text-muted">
          It reads the conversations that need you, writes a short summary and a reply draft, and flags what needs your review. Drafts are checked for invented claims, and nothing is sent without you. Email text goes to {status.model ?? "the model"} through your server.
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" className="rounded-full" onClick={() => setEnabled(true)}>
          <ShieldCheck className="h-4 w-4" /> Turn on
        </Button>
        <button onClick={dismissOffer} aria-label="Not now" className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-fg/[0.06]">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
