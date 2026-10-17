import { useState } from "react";
import { AlertTriangle, Archive, Bot, ChevronDown, MoreHorizontal, ShieldAlert, Tag } from "lucide-react";
import { SPOOFED_URGENCY, splitQuoted, type Decision, type Purpose, type TaskStatus, type Urgency } from "@c16/core";
import { formatReceived } from "../../lib/format";
import { useTriage } from "../../store/triage";
import { can } from "../../lib/permissions";
import { Avatar, Badge, Menu, MenuCheck, MenuContent, MenuItem, MenuSep, MenuSub, MenuTrigger, PURPOSE_LABEL, PurposeBadge, StatusBadge, UrgencyBadge, cn } from "../../ui";

/** Body text with each evidence quote marked; the quote the user clicked is emphasised. */
export function Highlighted({ body, quotes, active }: { body: string; quotes: string[]; active?: string | null }) {
  const ranges = quotes
    .map((q) => ({ q, i: q ? body.indexOf(q) : -1 }))
    .filter((r) => r.i >= 0)
    .sort((a, b) => a.i - b.i)
    .reduce<{ q: string; i: number }[]>((acc, r) => (acc.length && r.i < acc.at(-1)!.i + acc.at(-1)!.q.length ? acc : [...acc, r]), []);
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const r of ranges) {
    if (r.i > at) parts.push(body.slice(at, r.i));
    parts.push(
      <mark key={r.i} className={cn("rounded-[3px] px-0.5 text-inherit", r.q === active ? "bg-amber-300/80 ring-2 ring-amber-500" : "bg-amber-200/60 dark:bg-amber-400/25")}>
        {r.q}
      </mark>,
    );
    at = r.i + r.q.length;
  }
  parts.push(body.slice(at));
  return <p className="whitespace-pre-wrap text-[15px] leading-7">{parts}</p>;
}

const PURPOSES: Purpose[] = ["request", "correction", "resolution", "duplicate", "status_update", "fyi", "commitment", "question", "blocker"];
const URGENCIES: Urgency[] = ["high", "medium", "low"];
const STATUSES: TaskStatus[] = ["open", "in_progress", "blocked", "needs_review", "closed"];

export function MessageCard({ d, edited, active, collapsed: startCollapsed }: { d: Decision; edited: boolean; active?: string | null; collapsed?: boolean }) {
  const { editDecision, preview, role, busy } = useTriage();
  const [collapsed, setCollapsed] = useState(!!startCollapsed);
  const [why, setWhy] = useState(false);
  const quarantined = d.thread_key === "QUARANTINE";
  const { fresh: freshText, quoted } = splitQuoted(d.body);
  const fresh = quoted ? freshText : d.body;
  const editable = can(role, "edit_decision") && !quarantined;

  return (
    <article id={d.email_id} className={cn("scroll-mt-28 rounded-xl border bg-surface shadow-card transition", quarantined ? "border-rose-500/40" : "border-line", active ? "ring-2 ring-amber-400/60" : "")}>
      <header className="flex items-start gap-3 px-4 pt-4">
        {quarantined ? (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rose-600 text-white">
            <ShieldAlert className="h-4 w-4" />
          </span>
        ) : (
          <Avatar name={d.email_id} />
        )}
        <button className="min-w-0 flex-1 text-left" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed}>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{d.email_id}</span>
            <span className="truncate text-sm text-muted line-through decoration-muted/40" title="Subjects in this inbox are misleading and are not used for threading">
              {d.subject}
            </span>
            {edited && <Badge tone="violet">edited</Badge>}
            <span className="ml-auto shrink-0 text-xs text-muted">{formatReceived(d.received_at)}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <PurposeBadge purpose={d.purpose} />
            <UrgencyBadge urgency={d.urgency} />
            <StatusBadge status={d.status} />
            {d.action_needed && <Badge tone="brand">action</Badge>}
            {d.duplicate_of && <Badge>duplicate of {d.duplicate_of}</Badge>}
            {d.explain.urgency === SPOOFED_URGENCY && (
              <Badge tone="amber" title="The email uses urgent wording but asks nothing of us, so the urgency is not raised">
                spoofed urgency ignored
              </Badge>
            )}
            {d.facts.some((f) => f.kind === "attachment_claim") && (
              <Badge tone="amber" title="The email says a file is attached; the import carries no attachments, so it cannot be verified">
                attachment claimed, unverified
              </Badge>
            )}
            {quoted && (
              <Badge title="Quoted text from an older email is shown but never used for facts or actions">
                quoted history ignored
              </Badge>
            )}
            {d.ai && (
              <Badge tone={d.ai.decided_by === "both" ? "green" : "violet"} title={`${d.ai.source}: ${d.ai.reason}`}>
                <Bot className="h-3 w-3" /> AI {d.ai.decided_by === "both" ? "agrees" : d.ai.decided_by === "ai" ? "decided" : "overruled"} · {Math.round(d.ai.confidence * 100)}%
              </Badge>
            )}
          </div>
        </button>
        <Menu>
          <MenuTrigger asChild>
            <button className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-subtle hover:text-fg" aria-label={`Actions for ${d.email_id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </MenuTrigger>
          <MenuContent>
            <MenuSub icon={<Tag />} label="Correct type">
              {PURPOSES.map((p) => (
                <MenuCheck key={p} checked={d.purpose === p} onSelect={() => editable && editDecision(d.email_id, { purpose: p })}>
                  {PURPOSE_LABEL[p]}
                </MenuCheck>
              ))}
            </MenuSub>
            <MenuSub icon={<AlertTriangle />} label="Urgency">
              {URGENCIES.map((u) => (
                <MenuCheck key={u} checked={d.urgency === u} onSelect={() => editable && editDecision(d.email_id, { urgency: u })}>
                  <span className="capitalize">{u}</span>
                </MenuCheck>
              ))}
            </MenuSub>
            <MenuSub icon={<ChevronDown />} label="Status">
              {STATUSES.map((s) => (
                <MenuCheck key={s} checked={d.status === s} onSelect={() => editable && editDecision(d.email_id, { status: s })}>
                  {s.replace("_", " ")}
                </MenuCheck>
              ))}
            </MenuSub>
            <MenuSep />
            <MenuItem icon={<Tag />} disabled={!can(role, "preview") || busy} onSelect={() => preview(d.email_id, "label")}>
              Preview labels
            </MenuItem>
            <MenuItem icon={<Archive />} disabled={!can(role, "preview") || busy} onSelect={() => preview(d.email_id, "archive")}>
              Preview archive
            </MenuItem>
          </MenuContent>
        </Menu>
      </header>

      {!collapsed && (
        <div className="px-4 pb-4 pl-[3.75rem]">
          <div className={cn("mt-3", quarantined && "rounded-lg border border-rose-500/30 bg-rose-500/5 p-3")}>
            {quarantined && <div className="label-xs mb-1.5 text-rose-600">Shown as data · never followed</div>}
            <Highlighted body={fresh} quotes={d.facts.map((f) => f.evidence.quote)} active={active} />
            {quoted && (
              <div className="mt-3 border-l-2 border-line pl-3">
                <div className="label-xs mb-1">Quoted history · not used for facts or actions</div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-muted">{quoted}</p>
              </div>
            )}
          </div>
          {d.review?.needed && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <b>Needs review.</b> {d.review.reason}.{editable ? " Use ⋯ → Correct type if it is wrong." : ""}
              </span>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
            <button onClick={() => setWhy((w) => !w)} className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
              <ChevronDown className={cn("h-3.5 w-3.5 transition", why && "rotate-180")} /> Why this decision
            </button>
            <span className="inline-flex items-center gap-1">
              <Tag className="h-3 w-3" /> {d.proposed.labels.join(", ") || "no labels"} · {d.proposed.archive ? "archive suggested" : "keep in inbox"}
            </span>
          </div>
          {why && (
            <dl className="mt-2 grid animate-fade-in gap-x-4 gap-y-1 rounded-lg bg-subtle p-3 text-xs sm:grid-cols-[6.5rem_1fr]">
              <dt className="text-muted">Type</dt>
              <dd>{d.explain.purpose}</dd>
              <dt className="text-muted">Urgency</dt>
              <dd>{d.explain.urgency}</dd>
              <dt className="text-muted">Thread</dt>
              <dd>{d.explain.thread}</dd>
              <dt className="text-muted">Proposed</dt>
              <dd>{d.proposed.reason}</dd>
              {d.notes.map((n, i) => (
                <dd key={i} className="sm:col-start-2">
                  · {n}
                </dd>
              ))}
            </dl>
          )}
        </div>
      )}
    </article>
  );
}
