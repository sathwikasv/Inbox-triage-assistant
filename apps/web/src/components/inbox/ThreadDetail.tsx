import { useEffect, useRef, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Archive, ArrowLeft, Copy, Eye, Gavel, Lightbulb, MessagesSquare, MoreHorizontal, Reply, ShieldAlert, Sparkles, Tag, TrendingUp, X, History } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Fact, TriageResult } from "@c16/core";
import { useTriage } from "../../store/triage";
import { can } from "../../lib/permissions";
import { decisionsOf, topUrgency } from "../../lib/views";
import { formatDay } from "../../lib/format";
import { ACTION_META, AgeBadge, Badge, Button, Menu, MenuContent, MenuItem, MenuSep, MenuTrigger, StatusBadge, Tip, UrgencyBadge, cn } from "../../ui";
import { MessageCard } from "./MessageCard";
import { ComposerDock } from "./ComposerDock";
import { CopilotPanel } from "./CopilotPanel";
import { ActivityList, threadEvents } from "./ActivityList";

const tabCls =
  "inline-flex h-10 items-center gap-1.5 border-b-2 border-transparent px-1 text-sm font-medium text-muted transition hover:text-fg data-[state=active]:border-brand data-[state=active]:text-fg [&>svg]:h-4 [&>svg]:w-4";

export function ThreadDetail({ r, threadKey, onClose, onEscalate, replySignal }: { r: TriageResult; threadKey: string; onClose: () => void; onEscalate: (keys: string[]) => void; replySignal: number }) {
  const { run, role, busy, act, preview } = useTriage();
  const navigate = useNavigate();
  const t = r.threads.find((x) => x.thread_key === threadKey)!;
  const ds = decisionsOf(r, t);
  const [tab, setTab] = useState("conversation");
  const [active, setActive] = useState<Fact["evidence"] | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const meta = ACTION_META[t.next_action.kind];
  const canAct = can(role, "escalate");
  const quarantined = t.thread_key === "QUARANTINE";
  const events = threadEvents(run?.audit ?? [], t);

  useEffect(() => {
    setTab("conversation");
    setActive(null);
    setComposerOpen(t.next_action.kind === "reply" && window.matchMedia("(min-width: 1280px) and (min-height: 760px)").matches);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [threadKey, t.next_action.kind]);

  const reply = () => {
    setTab("conversation");
    setComposerOpen(true);
    setTimeout(() => composerRef.current?.focus(), 50);
  };
  useEffect(() => {
    if (replySignal) reply();
  }, [replySignal]);

  const cite = (e: Fact["evidence"]) => {
    setTab("conversation");
    setActive(e);
    setTimeout(() => document.getElementById(e.email_id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-canvas">
      {/* Header */}
      <header className="border-b border-line bg-surface px-5 pt-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Back to the list" className="-ml-2 xl:hidden">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">{t.title}</h1>
              <button onClick={() => navigator.clipboard?.writeText(t.thread_key)} className="inline-flex items-center gap-1 rounded-md bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-muted hover:text-fg" title="Copy thread key">
                {t.thread_key} <Copy className="h-3 w-3" />
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <StatusBadge status={t.status} />
              <UrgencyBadge urgency={topUrgency(ds)} />
              <AgeBadge days={t.age_days} />
              <span>· {t.email_ids.length} email{t.email_ids.length > 1 ? "s" : ""}</span>
              {t.owner && <span>· Owner {t.owner}</span>}
              {t.latest_due && <span>· Due {formatDay(t.latest_due)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Tip content={t.draft_mode === "none" ? "No reply needed for this thread" : "Open the reply draft (r)"}>
              <span>
                <Button variant={t.next_action.kind === "reply" ? "primary" : "secondary"} disabled={t.draft_mode === "none" || quarantined} onClick={reply}>
                  <Reply className="h-4 w-4" /> <span className="hidden sm:inline">Reply</span>
                </Button>
              </span>
            </Tip>
            <Button variant={t.next_action.kind === "escalate" ? "danger" : "secondary"} disabled={!canAct || busy} onClick={() => onEscalate([t.thread_key])}>
              <TrendingUp className="h-4 w-4" /> <span className="hidden sm:inline">Escalate</span>
            </Button>
            <Menu>
              <MenuTrigger asChild>
                <Button size="icon" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem icon={<Eye />} disabled={!canAct} onSelect={() => act(t.thread_key, "watch")}>
                  Watch
                </MenuItem>
                <MenuItem icon={<Archive />} disabled={!canAct || quarantined} onSelect={() => act(t.thread_key, "archive")}>
                  Mark for archive
                </MenuItem>
                <MenuItem icon={<Tag />} disabled={!canAct} onSelect={() => ds.forEach((d) => preview(d.email_id, "label"))}>
                  Preview labels for all
                </MenuItem>
                <MenuSep />
                <MenuItem icon={<Gavel />} onSelect={() => navigate("/judge")}>
                  Open judge view
                </MenuItem>
              </MenuContent>
            </Menu>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close thread" className="hidden xl:inline-flex">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className={cn("mt-3 flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm", t.next_action.kind === "escalate" ? "border-rose-500/30 bg-rose-500/[0.06]" : t.next_action.kind === "review" ? "border-amber-500/30 bg-amber-500/[0.07]" : "border-brand/20 bg-brand-soft/60")}>
          {quarantined ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" /> : <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand" />}
          <div className="flex-1">
            <span className="font-semibold">Suggested: {t.next_action.label}.</span> <span className="text-muted">{t.next_action.reason}.</span>
            {t.escalations.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {t.escalations.map((e) => (
                  <Badge key={e.code} tone={e.severity === "high" ? "red" : "amber"}>
                    {e.reason}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>

        <Tabs.Root value={tab} onValueChange={setTab}>
          <Tabs.List className="mt-2 flex gap-5" aria-label="Thread sections">
            <Tabs.Trigger value="conversation" className={tabCls}>
              <MessagesSquare /> Conversation <span className="text-xs text-muted">{ds.length}</span>
            </Tabs.Trigger>
            <Tabs.Trigger value="copilot" className={tabCls}>
              <Sparkles /> Copilot
            </Tabs.Trigger>
            <Tabs.Trigger value="activity" className={tabCls}>
              <History /> Activity <span className="text-xs text-muted">{events.length}</span>
            </Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      </header>

      {/* Body */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {tab === "conversation" && (
          <div className="mx-auto max-w-3xl space-y-3 p-4 lg:p-5">
            {quarantined && (
              <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/[0.07] p-4 text-sm">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                <div>
                  <div className="font-semibold text-rose-700 dark:text-rose-300">Quarantined: instruction-like content</div>
                  <p className="mt-0.5 text-muted">
                    {ds.map((d) => d.email_id).join(", ")} tried to instruct the assistant. No task, no draft and no archive were created. Policy after processing: draft_only: true · auto_send: false. 0 actions executed.
                  </p>
                </div>
              </div>
            )}
            {ds.map((d, i) => (
              <MessageCard key={d.email_id} d={d} edited={!!run?.decisionEdits[d.email_id]} active={active?.email_id === d.email_id ? active.quote : null} collapsed={ds.length > 2 && i < ds.length - 2 && active?.email_id !== d.email_id} />
            ))}
          </div>
        )}
        {tab === "copilot" && <CopilotPanel t={t} ds={ds} onCite={cite} />}
        {tab === "activity" && (
          <div className="p-5">
            <ActivityList events={events} empty="No activity on this thread yet. Escalations, edits, previews and approvals appear here." />
          </div>
        )}
      </div>

      {tab === "conversation" && <ComposerDock ref={composerRef} t={t} draft={r.drafts.find((d) => d.thread_key === t.thread_key)} edit={run?.edits[t.thread_key]} expanded={composerOpen} onExpanded={setComposerOpen} />}
    </section>
  );
}
