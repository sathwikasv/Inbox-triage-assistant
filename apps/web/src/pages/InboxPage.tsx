import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Inbox, Paperclip, RefreshCw, Search, Star } from "lucide-react";
import { CATEGORY_LABEL, setRead, type Category, type MailThread } from "@c16/core";
import { useMailbox, useMailboxView } from "../store/mailbox";
import { ThreadView } from "../components/mail/ThreadView";
import { CATS, CategoryBadge, ProviderMark, nameOf, shortTime } from "../components/mail/common";
import { Avatar, Badge, Button, EmptyState, Tip, cn } from "../ui";

export type Folder = "inbox" | "drafts" | "sent" | "archive" | "starred" | Category;
export const FOLDER_LABEL: Record<Folder, string> = { inbox: "Inbox", drafts: "Drafts", sent: "Sent", archive: "Archive", starred: "Starred", ...CATEGORY_LABEL };

export function inFolder(t: MailThread, folder: Folder, ctx: { drafts: Record<string, { sent_at: string | null }>; outbound: Set<string>; starred: Set<string> }) {
  switch (folder) {
    case "inbox":
      return !t.archived && t.category !== "spam";
    case "drafts":
      return !!ctx.drafts[t.key] && !ctx.drafts[t.key].sent_at;
    case "sent":
      return ctx.outbound.has(t.key);
    case "archive":
      return t.archived;
    case "starred":
      return ctx.starred.has(t.key);
    case "spam":
      return t.category === "spam";
    default:
      return !t.archived && t.category === folder;
  }
}

export default function InboxPage() {
  const view = useMailboxView();
  const { state, apply, refresh, busy } = useMailbox();
  const [params, setParams] = useSearchParams();
  const folder = (params.get("view") ?? "inbox") as Folder;
  const account = params.get("account") ?? "all";
  const selected = params.get("t");
  const [query, setQuery] = useState("");
  const msgById = useMemo(() => new Map(view.messages.map((m) => [m.id, m])), [view.messages]);

  const ctx = useMemo(() => {
    const outbound = new Set<string>();
    const starred = new Set<string>();
    for (const t of view.threads)
      for (const id of t.message_ids) {
        const m = msgById.get(id)!;
        if (m.direction === "outbound") outbound.add(t.key);
        if (state.starred[id] ?? m.starred) starred.add(t.key);
      }
    return { drafts: state.drafts, outbound, starred };
  }, [view.threads, msgById, state.drafts, state.starred]);

  const threads = view.threads.filter((t) => {
    if (account !== "all" && t.account_id !== account) return false;
    if (!inFolder(t, folder, ctx)) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return t.message_ids.some((id) => {
      const m = msgById.get(id)!;
      return `${m.subject} ${m.body} ${m.from.name ?? ""} ${m.from.email} ${m.to.map((a) => a.email).join(" ")}`.toLowerCase().includes(q);
    });
  });
  const current = view.threads.find((t) => t.key === selected) ?? null;
  const acc = view.accounts.find((a) => a.id === account);
  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v === null) p.delete(k);
    else p.set(k, v);
    setParams(p);
  };
  const open = (t: MailThread) => {
    set("t", t.key);
    const unread = t.message_ids.filter((id) => msgById.get(id)!.direction === "inbound" && !(state.read[id] ?? msgById.get(id)!.read));
    if (unread.length) apply((s) => unread.reduce((a, id) => setRead(a, id, true), s));
  };

  if (!view.accounts.length) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="card max-w-lg">
          <EmptyState icon={<Inbox />} title="No mailboxes yet" action={<Button variant="primary" onClick={() => (window.location.href = "/settings")}>Connect an account</Button>}>
            Connect Gmail, Outlook or Yahoo, import a file, or turn the demo accounts back on in Settings.
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("grid h-full min-h-0", current ? "lg:grid-cols-[26rem_minmax(0,1fr)]" : "grid-cols-1")}>
      <section className={cn("min-h-0 flex-col border-r border-line bg-surface", current ? "hidden lg:flex" : "flex")}>
        <div className="space-y-2 border-b border-line p-3">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold">{FOLDER_LABEL[folder]}</h1>
            <Badge>{threads.length}</Badge>
            {acc && (
              <button onClick={() => set("account", null)} className="inline-flex items-center gap-1 rounded-md bg-subtle px-1.5 py-0.5 text-xs" title="Show all accounts">
                <ProviderMark provider={acc.provider} size="xs" /> {acc.address} ×
              </button>
            )}
            {acc?.mode === "connected" && (
              <Tip content={`Fetch the latest mail from ${acc.address}`}>
                <Button size="icon" variant="ghost" className="ml-auto" onClick={() => refresh(acc.id)} aria-label="Refresh">
                  <RefreshCw className={cn("h-4 w-4", busy[`refresh:${acc.id}`] && "animate-spin")} />
                </Button>
              </Tip>
            )}
          </div>
          <div className="flex h-8 items-center gap-2 rounded-lg border border-line bg-subtle px-2.5 focus-within:border-brand/50 focus-within:bg-surface">
            <Search className="h-3.5 w-3.5 text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all accounts" aria-label="Search all accounts" className="w-full bg-transparent text-sm outline-none" />
          </div>
          {folder === "inbox" && (
            <div className="flex gap-1 overflow-x-auto pb-0.5">
              {CATS.filter((c) => c !== "spam").map((c) => {
                const n = view.threads.filter((t) => !t.archived && t.category === c && (account === "all" || t.account_id === account)).length;
                return n ? (
                  <button key={c} onClick={() => set("view", c)} className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-fg/80 hover:bg-subtle">
                    {CATEGORY_LABEL[c]} <span className="tabular-nums text-muted">{n}</span>
                  </button>
                ) : null;
              })}
            </div>
          )}
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
          {threads.map((t) => {
            const msgs = t.message_ids.map((id) => msgById.get(id)!);
            const last = msgs.at(-1)!;
            const firstIn = msgs.find((m) => m.direction === "inbound") ?? last;
            const a = view.accounts.find((x) => x.id === t.account_id)!;
            const draft = state.drafts[t.key];
            return (
              <li key={t.key}>
                <button onClick={() => open(t)} className={cn("relative flex w-full gap-3 px-3 py-3 text-left", t.key === selected ? "bg-brand-soft/70" : "hover:bg-subtle")}>
                  {t.unread > 0 && <span className="absolute left-1 top-5 h-1.5 w-1.5 rounded-full bg-brand" aria-label="unread" />}
                  <Avatar name={nameOf(last.direction === "outbound" ? (last.to[0] ?? last.from) : firstIn.from)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("truncate text-sm", t.unread ? "font-semibold" : "font-medium text-fg/85")}>{last.direction === "outbound" ? `To: ${last.to.map(nameOf).join(", ")}` : nameOf(firstIn.from)}</span>
                      {msgs.length > 1 && <span className="text-[11px] text-muted">{msgs.length}</span>}
                      <span className="ml-auto shrink-0 text-[11px] text-muted">{shortTime(t.last_at)}</span>
                    </div>
                    <div className={cn("truncate text-sm", t.unread ? "font-medium" : "text-fg/80")}>{t.subject}</div>
                    <div className="truncate text-xs text-muted">{t.category === "spam" ? "Suspicious content hidden" : last.body.replace(/\s+/g, " ")}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <ProviderMark provider={a.provider} size="xs" />
                      <CategoryBadge category={t.category} />
                      {t.priority === "critical" && <Badge tone="solidRed">critical</Badge>}
                      {ctx.starred.has(t.key) && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                      {msgs.some((m) => m.attachments.length) && <Paperclip className="h-3.5 w-3.5 text-muted" />}
                      {draft?.sent_at ? <Badge tone="green">replied</Badge> : draft ? <Badge tone="violet">draft</Badge> : null}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
          {threads.length === 0 && <li className="p-10 text-center text-sm text-muted">Nothing in {FOLDER_LABEL[folder].toLowerCase()}.</li>}
        </ul>
      </section>
      {current && <ThreadView key={current.key} view={view} thread={current} onBack={() => set("t", null)} />}
    </div>
  );
}
