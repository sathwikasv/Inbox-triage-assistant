import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, BadgeCheck, CalendarPlus, Check, Clock, Inbox, ListTodo, Loader2, Lock, Mail, MailOpen, Paperclip, RefreshCw, Search, Send, ShieldAlert, Sparkles, Star, Trash2, Users } from "lucide-react";
import {
  ActionError,
  CATEGORY_LABEL,
  EMPTY_STATE,
  TONES,
  acceptProposal,
  approveReplyDraft,
  archiveThread,
  buildMailboxView,
  discardReplyDraft,
  formatDate,
  lintReply,
  offsetLabel,
  recordSent,
  rejectProposal,
  replyHeaders,
  saveReplyDraft,
  sendCheck,
  setCategory,
  setRead,
  setStarred,
  splitQuoted,
  updateTask,
  type Address,
  type Category,
  type DraftTone,
  type MailAccount,
  type MailboxState,
  type MailMessage,
  type MailThread,
} from "@c16/core";
import { useTriage } from "../store/triage";
import { DEMO_MAILBOX } from "../lib/demoMailbox";
import { connectGmail, GOOGLE_CLIENT_ID_KEY, savedClientId } from "../lib/gmailConnect";
import { Avatar, Badge, Button, Dialog, EmptyState, Segmented, Tip, cn, type Tone } from "../ui";

const STATE_KEY = "c16.mailbox.state.v1";
const ACTOR = "Riya (this browser)";
const CATS: Category[] = ["urgent", "requires_action", "to_delegate", "meetings", "waiting", "follow_up", "important", "fyi", "promotions", "spam"];
const CAT_TONE: Record<Category, Tone> = { urgent: "red", requires_action: "brand", to_delegate: "amber", meetings: "blue", waiting: "violet", important: "amber", follow_up: "amber", fyi: "neutral", promotions: "green", spam: "solidRed" };
const CAT_DOT: Record<Category, string> = { urgent: "bg-rose-500", requires_action: "bg-indigo-500", to_delegate: "bg-amber-500", meetings: "bg-sky-500", waiting: "bg-violet-500", important: "bg-amber-400", follow_up: "bg-orange-500", fyi: "bg-slate-400", promotions: "bg-emerald-500", spam: "bg-red-700" };
const PROVIDER: Record<MailAccount["provider"], { label: string; letter: string; cls: string }> = {
  gmail: { label: "Gmail", letter: "G", cls: "bg-rose-500" },
  outlook: { label: "Outlook", letter: "O", cls: "bg-sky-600" },
  yahoo: { label: "Yahoo", letter: "Y", cls: "bg-violet-600" },
};
const PRIORITY_TONE: Record<string, Tone> = { critical: "solidRed", high: "red", normal: "brand", low: "neutral" };

function loadState(): MailboxState {
  try {
    return { ...EMPTY_STATE, ...JSON.parse(localStorage.getItem(STATE_KEY) ?? "{}") };
  } catch {
    return EMPTY_STATE;
  }
}
const nameOf = (a: Address) => a.name || a.email;
const time = (iso: string) => {
  const d = iso.slice(0, 10);
  return `${Number(d.slice(8, 10))} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(d.slice(5, 7)) - 1]}, ${iso.slice(11, 16)}`;
};
const addrList = (s: string): Address[] =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const m = /^(.*?)\s*<([^>]+)>$/.exec(x);
      return m ? { name: m[1] || undefined, email: m[2] } : { email: x };
    });
const addrText = (a: Address[]) => a.map((x) => (x.name ? `${x.name} <${x.email}>` : x.email)).join(", ");

function ProviderMark({ provider, size = "sm" }: { provider: MailAccount["provider"]; size?: "sm" | "xs" }) {
  const p = PROVIDER[provider];
  return <span className={cn("grid shrink-0 place-items-center rounded-md font-bold text-white", p.cls, size === "sm" ? "h-6 w-6 text-[11px]" : "h-4 w-4 text-[9px]")}>{p.letter}</span>;
}

export default function MailPage() {
  const { role, toast } = useTriage();
  const [state, setState] = useState<MailboxState>(loadState);
  const [live, setLive] = useState<{ account: MailAccount; messages: MailMessage[] }[]>([]);
  const [account, setAccount] = useState<string | "all">("all");
  const [cat, setCat] = useState<Category | "all">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [clientDialog, setClientDialog] = useState(false);
  const [clientId, setClientId] = useState(savedClientId());

  useEffect(() => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {
      /* not kept */
    }
  }, [state]);

  const data = useMemo(() => ({ ...DEMO_MAILBOX, accounts: [...DEMO_MAILBOX.accounts, ...live.map((l) => l.account)], messages: [...DEMO_MAILBOX.messages, ...live.flatMap((l) => l.messages)], user: { ...DEMO_MAILBOX.user, addresses: [...DEMO_MAILBOX.user.addresses, ...live.map((l) => l.account.address)] } }), [live]);
  const view = useMemo(() => buildMailboxView(data, state, { now: live.length ? new Date().toISOString() : DEMO_MAILBOX.demo_clock }), [data, state, live.length]);
  const accById = new Map(view.accounts.map((a) => [a.id, a]));
  const msgById = useMemo(() => new Map(view.messages.map((m) => [m.id, m])), [view.messages]);

  const threads = view.threads.filter((t) => {
    if (account !== "all" && t.account_id !== account) return false;
    if (cat === "all" ? t.archived || t.category === "spam" : t.category !== cat || t.archived) return false;
    if (query) {
      const q = query.toLowerCase();
      return t.message_ids.some((id) => {
        const m = msgById.get(id)!;
        return `${m.subject} ${m.body} ${m.from.name ?? ""} ${m.from.email}`.toLowerCase().includes(q);
      });
    }
    return true;
  });
  const current = view.threads.find((t) => t.key === selected) ?? null;
  const catCount = (c: Category) => view.threads.filter((t) => t.category === c && !t.archived && (account === "all" || t.account_id === account)).length;

  const act = (fn: (s: MailboxState) => MailboxState, ok?: string) => {
    try {
      setState((s) => fn(s));
      if (ok) toast(ok);
    } catch (e) {
      toast(e instanceof ActionError && e.reasons.length ? `${e.message}: ${e.reasons.join("; ")}` : (e as Error).message, "warn");
    }
  };
  const open = (t: MailThread) => {
    setSelected(t.key);
    const unread = t.message_ids.filter((id) => !(state.read[id] ?? msgById.get(id)!.read));
    if (unread.length) setState((s) => unread.reduce((acc, id) => setRead(acc, id, true), s));
  };

  async function connect() {
    if (!clientId) return setClientDialog(true);
    setConnecting(true);
    try {
      const r = await connectGmail(clientId);
      setLive((l) => [...l.filter((x) => x.account.id !== r.account.id), r]);
      setAccount(r.account.id);
      setCat("all");
      toast(`Connected ${r.account.address}: ${r.messages.length} emails fetched (read-only)`);
    } catch (e) {
      toast(`Gmail not connected: ${(e as Error).message}`, "warn");
    } finally {
      setConnecting(false);
    }
  }

  const pendingTasks = view.tasks.filter((t) => t.status !== "completed");
  const openFollowups = view.followups.filter((f) => f.status === "open");
  const meetingProposals = view.proposals.filter((p) => p.status === "proposed" && p.kind !== "cancellation");

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* KPI strip */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
        {[
          { label: "Unread", value: view.counts.unread, icon: <Mail className="h-3.5 w-3.5" />, onClick: () => setCat("all") },
          { label: "Urgent", value: view.counts.urgent, icon: <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />, onClick: () => setCat("urgent") },
          { label: "Requires action", value: view.counts.requires_action, icon: <Check className="h-3.5 w-3.5 text-indigo-500" />, onClick: () => setCat("requires_action") },
          { label: "Meeting requests", value: meetingProposals.length, icon: <CalendarPlus className="h-3.5 w-3.5 text-sky-500" />, onClick: () => setCat("meetings") },
          { label: "Open tasks", value: pendingTasks.length, icon: <ListTodo className="h-3.5 w-3.5 text-amber-500" /> },
          { label: "Follow-ups due", value: openFollowups.length, icon: <Clock className="h-3.5 w-3.5 text-orange-500" /> },
          { label: "Suspicious", value: view.counts.spam, icon: <ShieldAlert className="h-3.5 w-3.5 text-red-600" />, onClick: () => setCat("spam") },
        ].map((k) => (
          <button key={k.label} onClick={k.onClick} className="flex items-center gap-2 rounded-lg border border-line bg-subtle/60 px-3 py-1.5 text-left hover:bg-subtle">
            {k.icon}
            <span className="text-lg font-semibold tabular-nums">{k.value}</span>
            <span className="text-xs text-muted">{k.label}</span>
          </button>
        ))}
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-500/25 dark:text-amber-300">
          {live.length ? "Demo accounts + live Gmail (read-only)" : "Demo mode: fictional emails, simulated actions"}
        </span>
      </div>

      <div className={cn("grid min-h-0 flex-1", current ? "lg:grid-cols-[15rem_24rem_minmax(0,1fr)]" : "lg:grid-cols-[15rem_minmax(0,1fr)]")}>
        {/* Sidebar */}
        <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto border-r border-line bg-surface p-3 lg:flex">
          <div>
            <div className="label-xs px-2 pb-1.5">Accounts</div>
            <button onClick={() => setAccount("all")} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm", account === "all" ? "bg-brand-soft font-semibold text-brand" : "hover:bg-subtle")}>
              <Inbox className="h-4 w-4" /> <span className="flex-1 text-left">All inboxes</span>
              <span className="text-xs tabular-nums text-muted">{view.counts.unread}</span>
            </button>
            {view.accounts.map((a) => {
              const unread = view.threads.filter((t) => t.account_id === a.id && !t.archived).reduce((n, t) => n + t.unread, 0);
              return (
                <button key={a.id} onClick={() => setAccount(a.id)} className={cn("mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm", account === a.id ? "bg-brand-soft font-semibold text-brand" : "hover:bg-subtle")}>
                  <ProviderMark provider={a.provider} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{a.address}</span>
                    <span className="block text-[10px] font-normal text-muted">{a.mode === "demo" ? `${PROVIDER[a.provider].label} · demo data` : `${PROVIDER[a.provider].label} · connected, read-only`}</span>
                  </span>
                  {unread > 0 && <span className="text-xs tabular-nums text-muted">{unread}</span>}
                </button>
              );
            })}
            <div className="mt-2 space-y-1 px-1">
              <Button size="sm" variant="primary" className="w-full justify-center" disabled={connecting} onClick={connect}>
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ProviderMark provider="gmail" size="xs" />} Connect Gmail
              </Button>
              <Tip content="Needs a Microsoft Entra (Azure) app registration with Mail.Read; not configured yet.">
                <span className="block">
                  <Button size="sm" className="w-full justify-center" disabled>
                    <ProviderMark provider="outlook" size="xs" /> Connect Outlook
                  </Button>
                </span>
              </Tip>
              <Tip content="Yahoo has no public mail REST API; IMAP with OAuth2 needs Yahoo to approve the app. Not available yet.">
                <span className="block">
                  <Button size="sm" className="w-full justify-center" disabled>
                    <ProviderMark provider="yahoo" size="xs" /> Connect Yahoo
                  </Button>
                </span>
              </Tip>
            </div>
          </div>
          <div>
            <div className="label-xs px-2 pb-1.5">AI categories</div>
            <button onClick={() => setCat("all")} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-sm", cat === "all" ? "bg-subtle font-semibold" : "hover:bg-subtle")}>
              <Sparkles className="h-3.5 w-3.5 text-muted" /> <span className="flex-1 text-left">Everything</span>
            </button>
            {CATS.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-sm", cat === c ? "bg-subtle font-semibold" : "text-fg/80 hover:bg-subtle")}>
                <span className={cn("h-2 w-2 rounded-full", CAT_DOT[c])} />
                <span className="flex-1 text-left">{CATEGORY_LABEL[c]}</span>
                <span className="text-xs tabular-nums text-muted">{catCount(c)}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* List */}
        <section className={cn("min-h-0 flex-col border-r border-line bg-surface", current ? "hidden lg:flex" : "flex")}>
          <div className="flex items-center gap-2 border-b border-line p-3">
            <div className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-line bg-subtle px-2.5">
              <Search className="h-3.5 w-3.5 text-muted" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all accounts" aria-label="Search all accounts" className="w-full bg-transparent text-sm outline-none" />
            </div>
            <Tip content={live.length ? "Reconnect to refresh Gmail" : "Demo data is fixed; connect Gmail for live mail"}>
              <Button size="icon" variant="ghost" onClick={() => (live.length ? connect() : toast("Demo data is fixed. Connect Gmail to fetch real mail.", "info"))} aria-label="Refresh">
                <RefreshCw className={cn("h-4 w-4", connecting && "animate-spin")} />
              </Button>
            </Tip>
          </div>
          <div className="px-3 py-1.5 text-xs text-muted">
            {cat === "all" ? "Inbox" : CATEGORY_LABEL[cat]} · {threads.length} conversation{threads.length === 1 ? "" : "s"}
            {cat === "all" && view.counts.spam > 0 && <span> · {view.counts.spam} suspicious hidden</span>}
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
            {threads.map((t) => {
              const last = msgById.get(t.message_ids.at(-1)!)!;
              const firstIn = t.message_ids.map((id) => msgById.get(id)!).find((m) => m.direction === "inbound") ?? last;
              const acc = accById.get(t.account_id)!;
              const starred = t.message_ids.some((id) => state.starred[id] ?? msgById.get(id)!.starred);
              const attach = t.message_ids.some((id) => msgById.get(id)!.attachments.length > 0);
              return (
                <li key={t.key}>
                  <button onClick={() => open(t)} className={cn("relative flex w-full gap-3 px-3 py-3 text-left", t.key === selected ? "bg-brand-soft/70" : "hover:bg-subtle")}>
                    {t.unread > 0 && <span className="absolute left-1 top-5 h-1.5 w-1.5 rounded-full bg-brand" />}
                    <Avatar name={nameOf(last.direction === "outbound" ? (last.to[0] ?? last.from) : last.from)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("truncate text-sm", t.unread ? "font-semibold" : "font-medium text-fg/85")}>{last.direction === "outbound" ? `To: ${last.to.map(nameOf).join(", ")}` : nameOf(firstIn.from)}</span>
                        {t.message_ids.length > 1 && <span className="text-[11px] text-muted">{t.message_ids.length}</span>}
                        <span className="ml-auto shrink-0 text-[11px] text-muted">{time(t.last_at)}</span>
                      </div>
                      <div className={cn("truncate text-sm", t.unread ? "font-medium" : "text-fg/80")}>{t.subject}</div>
                      <div className="truncate text-xs text-muted">{t.category === "spam" ? "Suspicious content hidden" : last.body.replace(/\s+/g, " ")}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <ProviderMark provider={acc.provider} size="xs" />
                        <Badge tone={CAT_TONE[t.category]}>{CATEGORY_LABEL[t.category]}</Badge>
                        {t.priority === "critical" && <Badge tone="solidRed">critical</Badge>}
                        {starred && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                        {attach && <Paperclip className="h-3.5 w-3.5 text-muted" />}
                        {state.drafts[t.key]?.sent_at && <Badge tone="green">replied</Badge>}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
            {threads.length === 0 && <li className="p-8 text-center text-sm text-muted">Nothing here.</li>}
          </ul>
        </section>

        {/* Detail */}
        {current ? (
          <ThreadPanel key={current.key} view={view} thread={current} state={state} act={act} role={role} onClose={() => setSelected(null)} />
        ) : (
          <div className="hidden min-h-0 lg:block" />
        )}
      </div>

      <Dialog open={clientDialog} onOpenChange={setClientDialog} title="Connect a Gmail account" description="Read-only OAuth 2.0 (gmail.readonly). Your password is never entered here; Google shows its own consent screen.">
        <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>console.cloud.google.com → new project → enable the Gmail API.</li>
          <li>OAuth consent screen: External, Testing; add your spare Gmail as a test user.</li>
          <li>
            Credentials → OAuth client ID → Web application; authorised JavaScript origin <code className="font-mono text-xs">{window.location.origin}</code>.
          </li>
          <li>Paste the Client ID below (it is not a secret).</li>
        </ol>
        <input value={clientId} onChange={(e) => setClientId(e.target.value.trim())} placeholder="1234-abc.apps.googleusercontent.com" className="w-full rounded-lg border border-line bg-canvas/40 p-2.5 font-mono text-sm outline-none focus:border-brand/50" />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setClientDialog(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!/\.apps\.googleusercontent\.com$/.test(clientId)}
            onClick={() => {
              try {
                localStorage.setItem(GOOGLE_CLIENT_ID_KEY, clientId);
              } catch {
                /* not kept */
              }
              setClientDialog(false);
              setTimeout(connect, 0);
            }}
          >
            Save and connect
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function ThreadPanel({ view, thread, state, act, role, onClose }: { view: ReturnType<typeof buildMailboxView>; thread: MailThread; state: MailboxState; act: (fn: (s: MailboxState) => MailboxState, ok?: string) => void; role: "viewer" | "reviewer" | "approver"; onClose: () => void }) {
  const msgs = thread.message_ids.map((id) => view.messages.find((m) => m.id === id)!);
  const acc = view.accounts.find((a) => a.id === thread.account_id)!;
  const inbound = msgs.filter((m) => m.direction === "inbound");
  const lead = [...inbound].reverse().map((m) => view.insights[m.id]).find(Boolean);
  const task = view.tasks.find((t) => t.source.thread_key === thread.key);
  const proposal = view.proposals.find((p) => p.source.thread_key === thread.key);
  const now = new Date().toISOString();
  const starred = msgs.some((m) => state.starred[m.id] ?? m.starred);

  return (
    <section className="min-h-0 overflow-y-auto bg-canvas">
      <div className="mx-auto max-w-3xl space-y-4 p-4 lg:p-6">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">{thread.subject}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <ProviderMark provider={acc.provider} size="xs" /> {acc.address} · {acc.mode === "demo" ? "demo data" : "connected, read-only"} · {msgs.length} message{msgs.length > 1 ? "s" : ""}
            </div>
          </div>
          <Tip content={starred ? "Unmark important" : "Mark important"}>
            <Button size="icon" variant="ghost" onClick={() => act((s) => inbound.reduce((acc2, m) => setStarred(acc2, m.id, !starred, ACTOR, now), s))} aria-label="Star">
              <Star className={cn("h-4 w-4", starred && "fill-amber-400 text-amber-400")} />
            </Button>
          </Tip>
          <Tip content="Mark unread">
            <Button size="icon" variant="ghost" onClick={() => act((s) => inbound.reduce((acc2, m) => setRead(acc2, m.id, false), s))} aria-label="Mark unread">
              <MailOpen className="h-4 w-4" />
            </Button>
          </Tip>
          <Tip content={thread.archived ? "Move back to inbox" : "Archive in this workspace (nothing is deleted)"}>
            <Button size="icon" variant="ghost" onClick={() => act((s) => archiveThread(s, thread.key, !thread.archived, ACTOR, now), thread.archived ? "Moved back to the inbox" : "Archived here; the mailbox is unchanged")} aria-label="Archive">
              <Archive className="h-4 w-4" />
            </Button>
          </Tip>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        {/* AI insight */}
        {lead && (
          <div className={cn("card p-4", lead.suspicious && "border-rose-500/50 bg-rose-500/[0.04]")}>
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand" />
              <span className="text-sm font-semibold">Assistant</span>
              <Badge tone={CAT_TONE[lead.category]}>{CATEGORY_LABEL[lead.category]}</Badge>
              <Badge tone={PRIORITY_TONE[lead.priority]}>{lead.priority} priority</Badge>
              <span className="text-xs text-muted">decided by {lead.decided_by === "user" ? "you" : lead.decided_by === "ai" ? "AI" : "rules engine"}</span>
              <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
                Change
                <select
                  value={state.categories[lead.message_id] ?? ""}
                  onChange={(e) => act((s) => setCategory(s, lead.message_id, (e.target.value || null) as Category | null, ACTOR, now), "Category updated")}
                  className="rounded border border-line bg-surface px-1 py-0.5 text-xs text-fg"
                >
                  <option value="">Assistant's choice</option>
                  {CATS.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {lead.suspicious && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm text-white">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> Suspicious email. Its instructions are never followed, links are not opened, and replies are blocked.
              </div>
            )}
            <p className="mt-2 text-sm">{lead.reason}</p>
            <p className="mt-1 text-sm">
              <span className="font-medium">Next: </span>
              {lead.next_action}
            </p>
            {lead.flags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {lead.flags.includes("spoofed_urgency") && <Badge tone="amber">spoofed urgency ignored</Badge>}
                {lead.flags.includes("quoted_history_ignored") && <Badge>quoted old deadline ignored</Badge>}
                {lead.flags.includes("attachment_unverified") && <Badge tone="amber">attachment claimed, unverified</Badge>}
                {lead.flags.includes("needs_review") && <Badge tone="amber">needs review</Badge>}
              </div>
            )}
          </div>
        )}

        {/* Extracted task and meeting */}
        {(task || proposal) && (
          <div className="grid gap-3 md:grid-cols-2">
            {task && (
              <div className="card p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ListTodo className="h-4 w-4 text-amber-500" /> Task found
                  {task.overdue && <Badge tone="solidRed">overdue</Badge>}
                </div>
                <p className="mt-2 text-sm font-medium">{task.title}</p>
                <dl className="mt-2 grid grid-cols-[4.5rem_1fr] gap-y-1 text-xs">
                  <dt className="text-muted">Due</dt>
                  <dd>{task.due ? `${formatDate(task.due.date)}${task.due.time ? ` at ${task.due.time}` : ""} (UTC${offsetLabel(task.due.tz_offset)})` : (task.due_note ?? "no deadline given")}</dd>
                  <dt className="text-muted">Owner</dt>
                  <dd>{task.owner ?? "not stated"}</dd>
                  <dt className="text-muted">Status</dt>
                  <dd className="capitalize">{task.status.replace("_", " ")}</dd>
                </dl>
                {task.due?.needs_confirmation.map((n) => (
                  <p key={n} className="mt-1 text-xs text-amber-700 dark:text-amber-300">Confirm: {n}</p>
                ))}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {task.confirmed ? (
                    <>
                      <Badge tone="green">
                        <Check className="h-3 w-3" /> in your tasks
                      </Badge>
                      {task.status !== "completed" && (
                        <Button size="xs" onClick={() => act((s) => updateTask(s, task.id, { status: "completed" }, ACTOR, now), "Task completed")}>
                          Mark done
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <Button size="xs" variant="primary" onClick={() => act((s) => updateTask(s, task.id, { confirmed: true }, ACTOR, now), "Added to your tasks")}>
                        Add to tasks
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => act((s) => updateTask(s, task.id, { dismissed: true }, ACTOR, now), "Suggestion dismissed")}>
                        Dismiss
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
            {proposal && <ProposalCard view={view} proposal={proposal} act={act} now={now} />}
          </div>
        )}

        {/* Conversation */}
        <div className="space-y-3">
          {msgs.map((m) => {
            const { fresh, quoted } = splitQuoted(m.body);
            const ins = view.insights[m.id];
            const spam = ins?.suspicious;
            return (
              <article key={m.id} className={cn("card p-4", m.direction === "outbound" && "border-brand/30 bg-brand-soft/30")}>
                <header className="flex items-start gap-3">
                  <Avatar name={nameOf(m.from)} />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold">{nameOf(m.from)}</span>
                      <span className="text-xs text-muted">&lt;{m.from.email}&gt;</span>
                      {m.direction === "outbound" && <Badge tone="brand">{m.simulated ? "you · simulated send" : "you"}</Badge>}
                      <span className="ml-auto text-xs text-muted">{time(m.received_at)}</span>
                    </div>
                    <div className="text-xs text-muted">
                      to {m.to.map(nameOf).join(", ")}
                      {m.cc.length ? ` · cc ${m.cc.map(nameOf).join(", ")}` : ""}
                    </div>
                  </div>
                </header>
                <div className={cn("mt-3 whitespace-pre-wrap text-[15px] leading-7", spam && "rounded-lg border border-rose-500/30 bg-rose-500/5 p-3")}>{fresh || m.body}</div>
                {quoted && (
                  <div className="mt-3 border-l-2 border-line pl-3 text-sm text-muted">
                    <div className="label-xs mb-1">Quoted history · not used for tasks or deadlines</div>
                    <p className="whitespace-pre-wrap">{quoted}</p>
                  </div>
                )}
                {m.attachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.attachments.map((a) => (
                      <span key={a.name} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs">
                        <Paperclip className="h-3 w-3" /> {a.name}
                        {a.size_kb ? ` · ${a.size_kb} KB` : ""}
                      </span>
                    ))}
                  </div>
                )}
                {ins && m.id !== lead?.message_id && (
                  <div className="mt-2 text-xs text-muted">
                    <Badge tone={CAT_TONE[ins.category]}>{CATEGORY_LABEL[ins.category]}</Badge> {ins.reason}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {thread.category !== "spam" && <ReplyEditor view={view} thread={thread} state={state} act={act} role={role} account={acc} now={now} />}
      </div>
    </section>
  );
}

function ProposalCard({ view, proposal, act, now }: { view: ReturnType<typeof buildMailboxView>; proposal: ReturnType<typeof buildMailboxView>["proposals"][number]; act: (fn: (s: MailboxState) => MailboxState, ok?: string) => void; now: string }) {
  const [date, setDate] = useState(proposal.when?.date ?? "");
  const [timeV, setTimeV] = useState(proposal.when?.time ?? "");
  const [duration, setDuration] = useState(String(proposal.duration_min ?? 30));
  const kindLabel = { meeting_request: "Meeting request", invitation: "Invitation", confirmation: "Confirmation", reschedule: "Reschedule request", cancellation: "Cancellation" }[proposal.kind];
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <CalendarPlus className="h-4 w-4 text-sky-500" /> {kindLabel}
        {proposal.status !== "proposed" && <Badge tone={proposal.status === "accepted" ? "green" : "neutral"}>{proposal.status === "accepted" ? "in calendar (demo)" : "declined"}</Badge>}
      </div>
      <p className="mt-2 text-sm font-medium">{proposal.title}</p>
      <div className="mt-1 text-xs text-muted">
        {proposal.when ? `${formatDate(proposal.when.date)}${proposal.when.time ? ` · ${proposal.when.time}${proposal.when.end_time ? `–${proposal.when.end_time}` : ""}` : ""} (UTC${offsetLabel(proposal.when.tz_offset)}, ${proposal.when.tz_source === "stated" ? "stated in the email" : "sender's zone"})` : "No date in the email"}
        {proposal.location && ` · ${proposal.location}`}
      </div>
      {proposal.link && <div className="mt-0.5 truncate text-xs text-brand">{proposal.link}</div>}
      {proposal.participants.length > 0 && (
        <div className="mt-1 flex items-center gap-1 text-xs text-muted">
          <Users className="h-3 w-3" /> {proposal.participants.map((p) => p.name ?? p.email).join(", ")}
        </div>
      )}
      {proposal.when?.needs_confirmation.map((n) => (
        <p key={n} className="mt-1 text-xs text-amber-700 dark:text-amber-300">Confirm: {n}</p>
      ))}
      {proposal.conflicts.length > 0 && <p className="mt-1 text-xs text-rose-600">Conflicts with: {proposal.conflicts.join(", ")}</p>}
      {proposal.status === "proposed" && proposal.kind !== "cancellation" && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs" />
            <input type="time" value={timeV} onChange={(e) => setTimeV(e.target.value)} aria-label="Start time" className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs" />
            <select value={duration} onChange={(e) => setDuration(e.target.value)} aria-label="Duration" className="rounded-md border border-line bg-surface px-1 py-1 text-xs">
              {[15, 30, 45, 60, 90].map((d) => (
                <option key={d} value={d}>
                  {d} min
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex gap-1.5">
            <Button
              size="xs"
              variant="primary"
              onClick={() =>
                act((s) => acceptProposal(view, s, proposal.id, { date: date || undefined, time: timeV || null, duration_min: Number(duration), reminders_min: [15] }, "demo", ACTOR, now).state, "Added to the demo calendar with a 15-minute reminder")
              }
            >
              <CalendarPlus className="h-3.5 w-3.5" /> Add to calendar
            </Button>
            <Button size="xs" variant="ghost" onClick={() => act((s) => rejectProposal(s, proposal.id, ACTOR, now), "Declined; nothing added")}>
              Decline
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ReplyEditor({ view, thread, state, act, role, account, now }: { view: ReturnType<typeof buildMailboxView>; thread: MailThread; state: MailboxState; act: (fn: (s: MailboxState) => MailboxState, ok?: string) => void; role: "viewer" | "reviewer" | "approver"; account: MailAccount; now: string }) {
  const saved = state.drafts[thread.key];
  const headers = replyHeaders(view, thread.key, account);
  const proposal = view.proposals.find((p) => p.source.thread_key === thread.key && p.when?.time);
  const [tone, setTone] = useState<DraftTone>(saved?.tone ?? "standard");
  const suggested = thread.draft?.tones[tone] ?? thread.draft?.body ?? "Hi,\n\n\n\nRegards";
  const [to, setTo] = useState(addrText(saved?.to ?? headers?.to ?? []));
  const [cc, setCc] = useState(addrText(saved?.cc ?? headers?.cc ?? []));
  const [subject, setSubject] = useState(saved?.subject ?? headers?.subject ?? `Re: ${thread.subject}`);
  const [body, setBody] = useState(saved?.body ?? suggested);
  const [confirming, setConfirming] = useState(false);
  const [ticked, setTicked] = useState<string[]>([]);
  if (!headers) return null;

  const lint = lintReply(view, thread.key, body);
  const dirty = !saved || saved.body !== body || saved.subject !== subject || addrText(saved.to) !== to || addrText(saved.cc) !== cc;
  const check = sendCheck(view, state, thread.key, role);
  const sent = saved?.sent_at;
  const draftFields = () => ({ thread_key: thread.key, account_id: account.id, in_reply_to: headers.in_reply_to, to: addrList(to), cc: addrList(cc), subject, body, tone, source: (body === suggested ? "template" : "edited") as "template" | "edited" });

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <Send className="h-4 w-4 text-brand" />
        <span className="text-sm font-semibold">Reply</span>
        <Badge>{body === suggested ? "suggested draft" : "edited by you"}</Badge>
        {saved?.approved_at && !dirty && (
          <Badge tone="green">
            <BadgeCheck className="h-3 w-3" /> approved
          </Badge>
        )}
        {sent && <Badge tone="green">{saved.sent_simulated ? "sent (simulated, demo)" : "sent"}</Badge>}
        <span className="ml-auto">
          <Segmented
            value={tone}
            onChange={(v) => {
              setTone(v);
              if (thread.draft?.tones[v]) setBody(thread.draft.tones[v]!);
            }}
            options={TONES.map((x) => ({ value: x.id, label: x.label }))}
          />
        </span>
      </div>
      <div className="space-y-2 p-4 text-sm">
        {[
          ["To", to, setTo],
          ["Cc", cc, setCc],
          ["Subject", subject, setSubject],
        ].map(([label, value, set]) => (
          <label key={label as string} className="flex items-center gap-2 border-b border-line pb-2">
            <span className="w-14 text-xs text-muted">{label as string}</span>
            <input value={value as string} onChange={(e) => (set as (v: string) => void)(e.target.value)} disabled={!!sent} className="flex-1 bg-transparent outline-none" />
          </label>
        ))}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={!!sent} rows={7} aria-label="Reply body" className={cn("w-full resize-y rounded-lg border bg-canvas/40 p-3 text-[15px] leading-7 outline-none", lint.ok ? "border-line focus:border-brand/50" : "border-rose-400")} />
        {!lint.ok && (
          <ul className="space-y-1">
            {lint.violations.map((v, i) => (
              <li key={i} className="flex gap-2 rounded-md bg-rose-500/10 px-2 py-1 text-xs text-rose-800 dark:text-rose-200">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> "{v.term}": {v.reason}
              </li>
            ))}
          </ul>
        )}
        {proposal && !sent && (
          <button onClick={() => setBody(`Hi,\n\nThanks, ${formatDate(proposal.when!.date)} at ${proposal.when!.time} works for me. See you then.\n\nRegards`)} className="text-xs font-medium text-brand hover:underline">
            Use a reply accepting {formatDate(proposal.when!.date)} at {proposal.when!.time}
          </button>
        )}
        {!sent && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button variant="primary" disabled={!lint.ok || !dirty || role === "viewer"} onClick={() => act((s) => saveReplyDraft(view, s, draftFields(), ACTOR, now), "Draft saved")}>
              Save draft
            </Button>
            {role === "approver" && saved && !saved.approved_at && !dirty && (
              <Button variant="success" onClick={() => act((s) => approveReplyDraft(s, thread.key, role, ACTOR, now), "Reply approved (not sent)")}>
                <BadgeCheck className="h-4 w-4" /> Approve
              </Button>
            )}
            <Tip content={dirty ? "Save the draft first" : check.ok ? (check.simulated ? "Demo mode: the send is simulated and labelled" : "Sends through the connected account") : check.blockers.join("; ")}>
              <span>
                <Button variant="dark" disabled={dirty || !check.ok} onClick={() => setConfirming(true)}>
                  {check.ok ? <Send className="h-4 w-4" /> : <Lock className="h-4 w-4" />} Send{check.simulated ? " (demo)" : ""}
                </Button>
              </span>
            </Tip>
            {saved && (
              <Button variant="ghost" onClick={() => act((s) => discardReplyDraft(s, thread.key, ACTOR, now), "Draft discarded")}>
                <Trash2 className="h-4 w-4" /> Discard
              </Button>
            )}
            {!check.ok && !dirty && <span className="text-xs text-amber-700 dark:text-amber-300">{check.blockers.join("; ")}</span>}
          </div>
        )}
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming} title="Send this reply?" description={check.simulated ? "Demo mode: no email leaves the app. The reply is recorded in the conversation and labelled as simulated." : `Sends from ${account.address}.`}>
        <div className="space-y-1 rounded-lg bg-subtle p-3 text-sm">
          <div>
            <span className="text-muted">To:</span> {to}
          </div>
          {cc && (
            <div>
              <span className="text-muted">Cc:</span> {cc}
            </div>
          )}
          <div>
            <span className="text-muted">Subject:</span> {subject}
          </div>
        </div>
        {check.confirm.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <div className="label-xs">Confirm before sending</div>
            {check.confirm.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={ticked.includes(c)} onChange={(e) => setTicked((t) => (e.target.checked ? [...t, c] : t.filter((x) => x !== c)))} /> This reply {c}; I have checked it.
              </label>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button
            variant="dark"
            disabled={check.confirm.some((c) => !ticked.includes(c))}
            onClick={() => {
              act((s) => recordSent(view, s, thread.key, role, ticked, ACTOR, new Date().toISOString()).state, check.simulated ? "Sent (simulated in demo mode)" : "Sent");
              setConfirming(false);
            }}
          >
            <Send className="h-4 w-4" /> {check.simulated ? "Send (simulated)" : "Send now"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

export { EmptyState };
