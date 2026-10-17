import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Archive, ArchiveRestore, ArrowDownWideNarrow, CalendarClock, Columns2, Inbox, ListTodo, Mail, MailOpen, Paperclip, Reply, RefreshCw, Rows3, Search, ShieldAlert, Sparkles, Star, X } from "lucide-react";
import { CATEGORY_LABEL, setRead, splitQuoted, type Category, type MailThread, type MailboxView } from "@c16/core";
import { useApp } from "../store/app";
import { useMailbox, useMailboxView } from "../store/mailbox";
import { ThreadView } from "../components/mail/ThreadView";
import { CAT, CATS, CategoryBadge, PRIORITY_ORDER, PriorityBadge, ProviderMark, SenderAvatar, dayBucket, firstName, listTime, nameOf, type DayBucket } from "../components/mail/common";
import { FOLDER_LABEL, inFolder, queue, useThreadContext, type Folder, type ThreadContext } from "../lib/folders";
import { useThreadActions } from "../lib/threadActions";
import { Button, EmptyState, Kbd, Tip, cn } from "../ui";

export { FOLDER_LABEL, inFolder, type Folder } from "../lib/folders";

const BUCKETS: DayBucket[] = ["Today", "Yesterday", "Earlier this week", "Older"];
const PRIORITY_GROUP = { critical: "Critical", high: "High priority", normal: "Normal", low: "Low priority" } as const;
const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]");

/** What the list row needs to know about a conversation. */
function rowInfo(view: MailboxView, t: MailThread, ctx: ThreadContext) {
  const msgs = t.message_ids.map((id) => ctx.msgById.get(id)!);
  const last = msgs.at(-1)!;
  const names = [...new Set(msgs.map((m) => (m.direction === "outbound" ? "me" : firstName(m.from))))];
  const lead = msgs.find((m) => m.direction === "inbound") ?? last;
  const sender = msgs.every((m) => m.direction === "outbound") ? `To: ${last.to.map(nameOf).join(", ")}` : names.length > 1 ? names.slice(-3).join(", ") : nameOf(lead.from);
  const fresh = splitQuoted(last.body).fresh || last.body;
  return {
    msgs,
    sender,
    avatar: last.direction === "outbound" && msgs.every((m) => m.direction === "outbound") ? nameOf(last.to[0] ?? last.from) : nameOf(lead.from),
    snippet: t.category === "spam" ? "Suspicious content hidden. Open to see why it was quarantined." : fresh.replace(/\s+/g, " ").trim(),
    task: view.tasks.some((x) => x.source.thread_key === t.key && x.status !== "completed"),
    meeting: view.proposals.some((p) => p.source.thread_key === t.key && p.status === "proposed"),
    draft: !!ctx.drafts[t.key] && !ctx.drafts[t.key].sent_at,
    replied: !!ctx.drafts[t.key]?.sent_at,
  };
}

export default function InboxPage() {
  const view = useMailboxView();
  const { state, apply, refresh, busy } = useMailbox();
  const { prefs, setPrefs } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const folder = (params.get("view") ?? "inbox") as Folder;
  const account = params.get("account") ?? "all";
  const selectedKey = params.get("t");
  const query = params.get("q") ?? "";
  const unreadOnly = params.get("unread") === "1";
  const withFiles = params.get("files") === "1";
  const sort = params.get("sort") === "priority" ? "priority" : "date";
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const ctx = useThreadContext(view, state);
  const actions = useThreadActions(view);
  const tz = prefs.timezone;
  const split = prefs.pane === "right";

  const inScope = (t: MailThread) => account === "all" || t.account_id === account;
  const threads = useMemo(() => {
    const q = query.toLowerCase();
    const list = view.threads.filter((t) => {
      if (!inScope(t) || !inFolder(t, folder, ctx)) return false;
      if (unreadOnly && !t.unread) return false;
      if (withFiles && !ctx.attachments.has(t.key)) return false;
      if (!q) return true;
      return t.message_ids.some((id) => {
        const m = ctx.msgById.get(id)!;
        return `${m.subject} ${m.body} ${m.from.name ?? ""} ${m.from.email} ${m.to.map((a) => `${a.name ?? ""} ${a.email}`).join(" ")}`.toLowerCase().includes(q);
      });
    });
    return sort === "priority" ? [...list].sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) || Date.parse(b.last_at) - Date.parse(a.last_at)) : list;
  }, [view.threads, folder, account, query, unreadOnly, withFiles, sort, ctx]);

  const groups = useMemo(() => {
    const out: { label: string; items: MailThread[] }[] = [];
    for (const t of threads) {
      const label = sort === "priority" ? PRIORITY_GROUP[t.priority] : dayBucket(t.last_at, view.now, tz);
      const g = out.find((x) => x.label === label);
      if (g) g.items.push(t);
      else out.push({ label, items: [t] });
    }
    return sort === "priority" ? out : out.sort((a, b) => BUCKETS.indexOf(a.label as DayBucket) - BUCKETS.indexOf(b.label as DayBucket));
  }, [threads, sort, view.now, tz]);
  const ordered = groups.flatMap((g) => g.items);

  const current = view.threads.find((t) => t.key === selectedKey) ?? null;
  const index = current ? ordered.findIndex((t) => t.key === current.key) : -1;
  const acc = view.accounts.find((a) => a.id === account);
  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v === null) p.delete(k);
    else p.set(k, v);
    setParams(p);
  };
  const open = (t: MailThread | undefined) => {
    if (!t) return;
    setParam("t", t.key);
    const unread = t.message_ids.filter((id) => ctx.msgById.get(id)!.direction === "inbound" && !(state.read[id] ?? ctx.msgById.get(id)!.read));
    if (unread.length) apply((s) => unread.reduce((a, id) => setRead(a, id, true), s));
  };
  const close = () => setParam("t", null);
  const afterRemove = () => {
    const next = ordered[index + 1] ?? ordered[index - 1];
    if (split && next) open(next);
    else close();
  };
  const toggle = (key: string) =>
    setChecked((c) => {
      const n = new Set(c);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const sel = [...checked].filter((k) => threads.some((t) => t.key === k));
  const all = threads.length > 0 && sel.length === threads.length;

  useEffect(() => setChecked(new Set()), [folder, account, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector("[role=dialog]")) return;
      const k = e.key;
      if (k === "j" || k === "ArrowDown") open(ordered[index + 1] ?? ordered[0]);
      else if (k === "k" || k === "ArrowUp") open(ordered[Math.max(0, index - 1)]);
      else if (k === "Escape" && current) close();
      else if (k === "x" && current) toggle(current.key);
      else if (k === "e" && (sel.length || current)) {
        const keys = sel.length ? sel : [current!.key];
        actions.archive(keys, folder !== "archive");
        if (current && keys.includes(current.key)) afterRemove();
        setChecked(new Set());
      } else if (k === "s" && current) actions.star([current.key], !ctx.starred.has(current.key));
      else if (k === "U" && current) {
        actions.markRead([current.key], false);
        close();
      } else if (k === "r" && current) document.getElementById("reply-body")?.focus();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!view.accounts.length) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-lg">
          <EmptyState icon={<Inbox />} title="No mailboxes yet" action={<Button variant="primary" onClick={() => navigate("/settings")}>Connect a mailbox</Button>}>
            Connect Gmail, Outlook or Yahoo, import a file, or turn the demo mailboxes back on in Settings.
          </EmptyState>
        </div>
      </div>
    );
  }

  const catList = folder === "inbox" || (CATS as string[]).includes(folder);
  const chips = CATS.filter((c) => c !== "spam").map((c) => ({ c, n: view.threads.filter((t) => !t.archived && t.category === c && inScope(t)).length }));
  const meta = (CATS as string[]).includes(folder) ? CAT[folder as Category] : null;

  const list = (
    <section className={cn("flex min-h-0 min-w-0 flex-col", split && current ? "hidden border-r border-line lg:flex" : "flex", !split && current && "hidden")}>
      <div className="border-b border-line">
        <div className="flex h-12 items-center gap-1 px-2 sm:px-3">
          <span className="grid h-9 w-9 place-items-center">
            <input
              type="checkbox"
              aria-label="Select all"
              checked={all}
              ref={(el) => {
                if (el) el.indeterminate = sel.length > 0 && !all;
              }}
              onChange={() => setChecked(all ? new Set() : new Set(threads.map((t) => t.key)))}
            />
          </span>
          {sel.length > 0 ? (
            <div className="flex animate-fade-in items-center gap-0.5">
              <span className="mr-2 text-sm font-semibold">{sel.length} selected</span>
              <IconBtn label={folder === "archive" ? "Move to inbox" : "Archive"} onClick={() => {
                  actions.archive(sel, folder !== "archive");
                  setChecked(new Set());
                }}>
                {folder === "archive" ? <ArchiveRestore className="h-[18px] w-[18px]" /> : <Archive className="h-[18px] w-[18px]" />}
              </IconBtn>
              <IconBtn label="Mark as read" onClick={() => actions.markRead(sel, true)}>
                <MailOpen className="h-[18px] w-[18px]" />
              </IconBtn>
              <IconBtn label="Mark as unread" onClick={() => actions.markRead(sel, false)}>
                <Mail className="h-[18px] w-[18px]" />
              </IconBtn>
              <IconBtn label="Star" onClick={() => actions.star(sel, true)}>
                <Star className="h-[18px] w-[18px]" />
              </IconBtn>
              <select
                value=""
                aria-label="Move to category"
                onChange={(e) => {
                  if (e.target.value) actions.move(sel, e.target.value as Category);
                  setChecked(new Set());
                }}
                className="field ml-1 h-8"
              >
                <option value="">Move to…</option>
                {CATS.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-[15px] font-semibold">{FOLDER_LABEL[folder]}</h2>
              <span className="text-xs tabular-nums text-muted">{threads.length}</span>
              {acc && (
                <button onClick={() => setParam("account", null)} className="inline-flex items-center gap-1 rounded-full bg-subtle py-0.5 pl-1 pr-2 text-xs hover:bg-fg/10" title="Show all mailboxes">
                  <ProviderMark provider={acc.provider} size="xs" /> {acc.address} <X className="h-3 w-3" />
                </button>
              )}
              {acc?.mode === "connected" && (
                <IconBtn label={`Fetch new mail for ${acc.address}`} onClick={() => refresh(acc.id)}>
                  <RefreshCw className={cn("h-4 w-4", busy[`refresh:${acc.id}`] && "animate-spin")} />
                </IconBtn>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-0.5">
            <IconBtn label={sort === "priority" ? "Sorted by priority (click for newest first)" : "Sorted by newest (click for priority)"} active={sort === "priority"} onClick={() => setParam("sort", sort === "priority" ? null : "priority")}>
              <ArrowDownWideNarrow className="h-[18px] w-[18px]" />
            </IconBtn>
            <IconBtn label={prefs.density === "compact" ? "Comfortable rows" : "Compact rows"} active={prefs.density === "compact"} onClick={() => setPrefs({ density: prefs.density === "compact" ? "comfortable" : "compact" })}>
              <Rows3 className="h-[18px] w-[18px]" />
            </IconBtn>
            <IconBtn label={split ? "Hide the reading pane" : "Show a reading pane"} active={split} onClick={() => setPrefs({ pane: split ? "off" : "right" })}>
              <Columns2 className="h-[18px] w-[18px]" />
            </IconBtn>
          </div>
        </div>

        <div className="flex h-10 items-center gap-2 border-t border-line px-3 md:hidden">
          <Search className="h-4 w-4 text-muted" />
          <input value={query} onChange={(e) => setParam("q", e.target.value || null)} placeholder="Search mail" aria-label="Search all accounts" className="w-full bg-transparent text-sm outline-none" />
        </div>

        {catList && (
          <div className="flex gap-1.5 overflow-x-auto px-3 pb-2.5 pt-0.5 [scrollbar-width:none]">
            <Chip active={folder === "inbox"} onClick={() => setParam("view", null)}>
              <Inbox className="h-3.5 w-3.5" /> All
            </Chip>
            {chips
              .filter((x) => x.n > 0)
              .map(({ c, n }) => {
                const Icon = CAT[c].icon;
                return (
                  <Chip key={c} active={folder === c} activeCls={CAT[c].solid} onClick={() => setParam("view", folder === c ? null : c)} title={CAT[c].help}>
                    <Icon className={cn("h-3.5 w-3.5", folder !== c && CAT[c].text)} /> {CAT[c].short} <span className="tabular-nums opacity-70">{n}</span>
                  </Chip>
                );
              })}
            <span className="mx-1 w-px shrink-0 bg-line" />
            <Chip active={unreadOnly} onClick={() => setParam("unread", unreadOnly ? null : "1")}>
              Unread
            </Chip>
            <Chip active={withFiles} onClick={() => setParam("files", withFiles ? null : "1")}>
              <Paperclip className="h-3.5 w-3.5" /> Attachments
            </Chip>
          </div>
        )}
        {meta && (
          <div className={cn("flex items-center gap-2 border-t border-line px-4 py-2 text-xs", meta.soft)}>
            <meta.icon className={cn("h-4 w-4 shrink-0", meta.text)} />
            <span>
              <b className="font-semibold">{CATEGORY_LABEL[folder as Category]}.</b> <span className="text-muted">{meta.help}</span>
            </span>
          </div>
        )}
        {folder === "spam" && (
          <div className="flex items-center gap-2 border-t border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
            <ShieldAlert className="h-4 w-4 shrink-0" /> Quarantined: links are not opened, instructions are never followed and replies are blocked.
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="sticky top-0 z-[2] border-b border-line bg-surface/95 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted backdrop-blur">{g.label}</div>
            <ul>
              {g.items.map((t) => (
                <Row
                  key={t.key}
                  view={view}
                  t={t}
                  ctx={ctx}
                  card={split}
                  compact={prefs.density === "compact"}
                  active={t.key === selectedKey}
                  checked={checked.has(t.key)}
                  selecting={sel.length > 0}
                  now={view.now}
                  tz={tz}
                  onOpen={() => open(t)}
                  onCheck={() => toggle(t.key)}
                  onArchive={() => {
                    actions.archive([t.key], folder !== "archive");
                    if (t.key === selectedKey) afterRemove();
                  }}
                  onRead={() => actions.markRead([t.key], t.unread > 0)}
                  onStar={() => actions.star([t.key], !ctx.starred.has(t.key))}
                />
              ))}
            </ul>
          </div>
        ))}
        {threads.length === 0 && (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="text-sm font-semibold">{query ? `No results for "${query}"` : `Nothing in ${FOLDER_LABEL[folder].toLowerCase()}`}</div>
            <p className="mt-1 text-xs text-muted">{query ? "Try another word, or search all folders from Inbox." : "You're all caught up here."}</p>
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div className={cn("grid h-full min-h-0 grid-cols-1", split && "lg:grid-cols-[minmax(22rem,30rem)_minmax(0,1fr)]")}>
      {list}
      {current ? (
        <ThreadView
          key={current.key}
          view={view}
          thread={current}
          onBack={close}
          position={index >= 0 ? { index, total: ordered.length, prev: () => open(ordered[index - 1]), next: () => open(ordered[index + 1]) } : undefined}
          onRemoved={afterRemove}
        />
      ) : (
        split && <EmptyPane view={view} threads={threads} ctx={ctx} onOpen={open} />
      )}
    </div>
  );
}

function IconBtn({ label, onClick, children, active }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <Tip content={label}>
      <button onClick={onClick} aria-label={label} className={cn("grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-fg/[0.08] hover:text-fg", active && "bg-brand-soft text-fg")}>
        {children}
      </button>
    </Tip>
  );
}

function Chip({ active, activeCls, onClick, children, title }: { active: boolean; activeCls?: string; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition",
        active ? cn("border-transparent shadow-sm", activeCls ?? "bg-brand-soft text-fg") : "border-line bg-surface text-fg/80 hover:bg-subtle",
      )}
    >
      {children}
    </button>
  );
}

function Row(p: {
  view: MailboxView;
  t: MailThread;
  ctx: ThreadContext;
  card: boolean;
  compact: boolean;
  active: boolean;
  checked: boolean;
  selecting: boolean;
  now: string;
  tz: string;
  onOpen: () => void;
  onCheck: () => void;
  onArchive: () => void;
  onRead: () => void;
  onStar: () => void;
}) {
  const { t, ctx } = p;
  const r = rowInfo(p.view, t, ctx);
  const acc = p.view.accounts.find((a) => a.id === t.account_id)!;
  const unread = t.unread > 0;
  const starred = ctx.starred.has(t.key);
  const m = CAT[t.category];
  const bg = p.active ? "bg-brand-soft/80" : p.checked ? "bg-brand-soft/50" : unread ? "bg-row-unread" : "bg-row-read";
  const icons = (
    <>
      {r.meeting && <CalendarClock className="h-3.5 w-3.5 shrink-0 text-sky-600" aria-label="meeting request" />}
      {r.task && <ListTodo className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="task found" />}
      {ctx.attachments.has(t.key) && <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="attachment" />}
      {r.replied && <Reply className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="replied" />}
    </>
  );
  const hover = (
    <div className="absolute right-2 top-1/2 z-[1] hidden -translate-y-1/2 items-center gap-0.5 rounded-full bg-surface/95 px-1 shadow-card group-hover:flex">
      <HoverBtn label={starred ? "Unstar" : "Star"} onClick={p.onStar}>
        <Star className={cn("h-4 w-4", starred && "fill-amber-400 text-amber-400")} />
      </HoverBtn>
      <HoverBtn label={unread ? "Mark as read" : "Mark as unread"} onClick={p.onRead}>
        {unread ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
      </HoverBtn>
      <HoverBtn label={t.archived ? "Move to inbox" : "Archive"} onClick={p.onArchive}>
        {t.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
      </HoverBtn>
    </div>
  );
  const stripe = <span className={cn("absolute inset-y-0 left-0 w-[3px]", m.stripe, !unread && "opacity-40")} aria-hidden />;

  if (p.card) {
    return (
      <li data-thread={t.key} className={cn("group relative border-b border-line transition-colors hover:z-[1] hover:shadow-row", bg)}>
        {stripe}
        <div className={cn("flex gap-3 pl-4 pr-3", p.compact ? "py-2" : "py-3")}>
          <span className="relative mt-0.5 grid h-9 w-9 shrink-0 place-items-center">
            <span className={cn(p.selecting || p.checked ? "hidden" : "group-hover:hidden")}>
              <SenderAvatar name={r.avatar} provider={acc.provider} size={p.compact ? "sm" : "md"} />
            </span>
            <input type="checkbox" aria-label={`Select ${t.subject}`} checked={p.checked} onChange={p.onCheck} className={cn(p.selecting || p.checked ? "block" : "hidden group-hover:block")} />
          </span>
          <button onClick={p.onOpen} className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-1.5">
              {r.draft && <span className="text-xs font-semibold text-rose-600">Draft</span>}
              <span className={cn("truncate text-sm", unread ? "font-bold" : "font-medium text-fg/80")}>{r.sender}</span>
              {r.msgs.length > 1 && <span className="text-xs text-muted">{r.msgs.length}</span>}
              <span className={cn("ml-auto shrink-0 text-xs tabular-nums group-hover:invisible", unread ? "font-bold text-fg" : "text-muted")}>{listTime(t.last_at, p.now, p.tz)}</span>
            </div>
            <div className={cn("mt-px truncate text-[13px]", unread ? "font-semibold" : "text-fg/80")}>{t.subject}</div>
            {!p.compact && <div className="mt-px line-clamp-1 text-[13px] text-muted">{r.snippet}</div>}
            <div className="mt-1.5 flex items-center gap-1.5">
              <CategoryBadge category={t.category} />
              <PriorityBadge priority={t.priority} />
              {starred && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="starred" />}
              {icons}
            </div>
          </button>
        </div>
        {hover}
      </li>
    );
  }

  return (
    <li data-thread={t.key} className={cn("group relative border-b border-line transition-colors hover:z-[1] hover:shadow-row", bg)}>
      {stripe}
      <div className={cn("flex items-center gap-1 pl-3 pr-3", p.compact ? "h-9" : "h-11")}>
        <span className="grid h-8 w-8 shrink-0 place-items-center">
          <input type="checkbox" aria-label={`Select ${t.subject}`} checked={p.checked} onChange={p.onCheck} />
        </span>
        <button onClick={p.onStar} aria-label={starred ? "Unstar" : "Star"} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-fg/[0.08]">
          <Star className={cn("h-4 w-4", starred && "fill-amber-400 text-amber-400")} />
        </button>
        <button onClick={p.onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {!p.compact && <SenderAvatar name={r.avatar} size="sm" />}
          <span className={cn("flex w-28 shrink-0 items-center gap-1.5 truncate text-sm sm:w-52", unread ? "font-bold" : "text-fg/80")}>
            <ProviderMark provider={acc.provider} size="xs" />
            {r.draft && <span className="text-rose-600">Draft</span>}
            <span className="truncate">{r.sender}</span>
            {r.msgs.length > 1 && <span className="text-xs font-normal text-muted">{r.msgs.length}</span>}
          </span>
          <CategoryBadge category={t.category} className="hidden sm:inline-flex" />
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className={cn(unread ? "font-bold" : "text-fg/85")}>{t.subject}</span>
            <span className="text-muted"> — {r.snippet}</span>
          </span>
          <span className="hidden items-center gap-1.5 md:flex">
            <PriorityBadge priority={t.priority} />
            {icons}
          </span>
          <span className={cn("w-14 shrink-0 text-right text-xs tabular-nums group-hover:invisible", unread ? "font-bold text-fg" : "text-muted")}>{listTime(t.last_at, p.now, p.tz)}</span>
        </button>
      </div>
      {hover}
    </li>
  );
}

function HoverBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tip content={label}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        aria-label={label}
        className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-fg/[0.08] hover:text-fg"
      >
        {children}
      </button>
    </Tip>
  );
}

/** The reading pane before a conversation is chosen: what is in this list, and where to start. */
function EmptyPane({ view, threads, ctx, onOpen }: { view: MailboxView; threads: MailThread[]; ctx: ThreadContext; onOpen: (t: MailThread) => void }) {
  const todo = queue(view, ctx).filter((t) => threads.includes(t));
  const counts = CATS.map((c) => ({ c, n: threads.filter((t) => t.category === c).length })).filter((x) => x.n > 0);
  const total = threads.length || 1;
  const unread = threads.reduce((n, t) => n + t.unread, 0);
  return (
    <section className="hidden min-h-0 overflow-y-auto bg-canvas/40 lg:block">
      <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-14 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-brand-soft to-surface text-brand shadow-card">
          <Mail className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Select a conversation to read</h2>
        <p className="mt-1 text-sm text-muted">
          {threads.length} conversation{threads.length === 1 ? "" : "s"} here, {unread} unread. {todo.length > 0 ? `${todo.length} still need you.` : "Nothing is waiting on you."}
        </p>
        {todo[0] && (
          <Button variant="primary" size="md" className="mt-5 rounded-full" onClick={() => onOpen(todo[0])}>
            <Sparkles className="h-4 w-4" /> Start with "{todo[0].subject}"
          </Button>
        )}
        {counts.length > 0 && (
          <div className="mt-8 w-full rounded-2xl border border-line bg-surface p-4 text-left">
            <div className="label-xs mb-3">What's in this list</div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-subtle">
              {counts.map(({ c, n }) => (
                <span key={c} className={CAT[c].dot} style={{ width: `${(n / total) * 100}%` }} title={`${CAT[c].short}: ${n}`} />
              ))}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
              {counts.map(({ c, n }) => (
                <li key={c}>
                  <Link to={`/inbox?view=${c}`} className="flex items-center gap-2 text-xs hover:underline">
                    <span className={cn("h-2 w-2 rounded-full", CAT[c].dot)} /> <span className="flex-1">{CAT[c].short}</span> <span className="tabular-nums text-muted">{n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted">
          <span>
            <Kbd>j</Kbd> <Kbd>k</Kbd> move
          </span>
          <span>
            <Kbd>e</Kbd> archive
          </span>
          <span>
            <Kbd>r</Kbd> reply
          </span>
          <span>
            <Kbd>?</Kbd> all shortcuts
          </span>
        </div>
      </div>
    </section>
  );
}
