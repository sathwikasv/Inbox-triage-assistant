import { useMemo, useState } from "react";
import { Archive, ArrowUpDown, Download, Eye, Filter, Link2, MoreHorizontal, Reply, Search, Tag, TrendingUp, X, Columns3, Rows3 } from "lucide-react";
import type { Purpose, ThreadFacts, TriageResult, Urgency } from "@c16/core";
import { decisionsOf, sortThreads, topUrgency } from "../../lib/views";
import { ThreadBoard } from "./ThreadBoard";
import type { SavedRun } from "../../repo";
import { formatDay, formatReceived } from "../../lib/format";
import { ACTION_META, AgeBadge, Avatar, Badge, Button, Menu, MenuCheck, MenuContent, MenuItem, MenuLabel, MenuSep, MenuTrigger, PURPOSE_LABEL, PurposeBadge, Tip, UrgencyBadge, cn , Segmented } from "../../ui";

export type SortKey = "priority" | "newest" | "oldest" | "due";
export interface TableActions {
  open(key: string): void;
  reply(key: string): void;
  escalate(keys: string[]): void;
  watch(key: string): void;
  archive(keys: string[]): void;
  previewLabels(keys: string[]): void;
  canAct: boolean;
}

function exportCsv(r: TriageResult, rows: ThreadFacts[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["thread_key", "title", "emails", "types", "urgency", "owner", "due", "status", "next_action", "escalations"];
  const lines = rows.map((t) => {
    const ds = decisionsOf(r, t);
    return [t.thread_key, t.title, t.email_ids.join(" "), [...new Set(ds.map((d) => d.purpose))].join(" "), topUrgency(ds), t.owner ?? (t.owner === null ? "unassigned" : ""), t.latest_due ?? "", t.status, t.next_action.label, t.escalations.map((e) => e.code).join(" ")].map(esc).join(",");
  });
  const url = URL.createObjectURL(new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" }));
  Object.assign(document.createElement("a"), { href: url, download: `triage-${r.fixture_hash}.csv` }).click();
  URL.revokeObjectURL(url);
}

export type Layout = "table" | "board";

export function ThreadTable({ r, run, threads, title, selected, compact, actions, layout = "table", onLayout }: { r: TriageResult; run: SavedRun; threads: ThreadFacts[]; title: string; selected?: string; compact: boolean; actions: TableActions; layout?: Layout; onLayout?: (l: Layout) => void }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("priority");
  const [types, setTypes] = useState<Purpose[]>([]);
  const [urgencies, setUrgencies] = useState<Urgency[]>([]);
  const [checked, setChecked] = useState<string[]>([]);

  const allTypes = [...new Set(r.decisions.map((d) => d.purpose))];
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = threads.filter((t) => {
      const ds = decisionsOf(r, t);
      if (types.length && !ds.some((d) => types.includes(d.purpose))) return false;
      if (urgencies.length && !urgencies.includes(topUrgency(ds))) return false;
      if (q && ![t.title, t.thread_key, t.owner ?? "", ...ds.map((d) => `${d.email_id} ${d.body}`)].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
    const time = (t: ThreadFacts) => (t.last_activity ? Date.parse(t.last_activity) : 0);
    if (sort === "newest") return [...filtered].sort((a, b) => time(b) - time(a));
    if (sort === "oldest") return [...filtered].sort((a, b) => time(a) - time(b));
    if (sort === "due") return [...filtered].sort((a, b) => (a.latest_due ?? "9999").localeCompare(b.latest_due ?? "9999"));
    return sortThreads(r, filtered);
  }, [r, threads, query, sort, types, urgencies]);

  const toggle = (k: string) => setChecked((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));
  const allChecked = rows.length > 0 && rows.every((t) => checked.includes(t.thread_key));
  const filters = types.length + urgencies.length;

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="mr-1 text-base font-semibold">{title}</h2>
        <Badge>{rows.length}</Badge>
        {onLayout && !compact && (
          <Segmented
            value={layout}
            onChange={onLayout}
            options={[
              { value: "table", label: <><Rows3 className="h-3.5 w-3.5" /> Table</> },
              { value: "board", label: <><Columns3 className="h-3.5 w-3.5" /> Board</> },
            ]}
          />
        )}
        <div className={cn("flex h-8 items-center gap-2 rounded-lg border border-line bg-subtle px-2.5 focus-within:border-brand/50 focus-within:bg-surface", compact ? "order-last w-full" : "order-last w-full sm:order-none sm:ml-auto sm:w-56")}>
          <Search className="h-3.5 w-3.5 text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter threads…" aria-label="Filter threads" className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear filter">
              <X className="h-3.5 w-3.5 text-muted" />
            </button>
          )}
        </div>
        <Menu>
          <MenuTrigger asChild>
            <Button size="sm" variant={filters ? "primary" : "secondary"} aria-label="Filters" className={cn(compact && "ml-auto")}>
              <Filter className="h-3.5 w-3.5" /> {!compact && "Filter"} {filters > 0 && <span className="rounded bg-white/25 px-1 text-[10px]">{filters}</span>}
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuLabel>Type</MenuLabel>
            {allTypes.map((p) => (
              <MenuCheck key={p} checked={types.includes(p)} onSelect={() => setTypes((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]))}>
                {PURPOSE_LABEL[p]}
              </MenuCheck>
            ))}
            <MenuSep />
            <MenuLabel>Urgency</MenuLabel>
            {(["high", "medium", "low"] as Urgency[]).map((u) => (
              <MenuCheck key={u} checked={urgencies.includes(u)} onSelect={() => setUrgencies((x) => (x.includes(u) ? x.filter((y) => y !== u) : [...x, u]))}>
                <span className="capitalize">{u}</span>
              </MenuCheck>
            ))}
            {filters > 0 && (
              <>
                <MenuSep />
                <MenuItem
                  icon={<X />}
                  onSelect={() => {
                    setTypes([]);
                    setUrgencies([]);
                  }}
                >
                  Clear filters
                </MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
        <Menu>
          <MenuTrigger asChild>
            <Button size="sm" aria-label="Sort">
              <ArrowUpDown className="h-3.5 w-3.5" /> {!compact && ({ priority: "Priority", newest: "Newest", oldest: "Oldest", due: "Due date" }[sort])}
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuLabel>Sort by</MenuLabel>
            {(["priority", "newest", "oldest", "due"] as SortKey[]).map((s) => (
              <MenuCheck key={s} checked={sort === s} onSelect={() => setSort(s)}>
                {{ priority: "Priority (escalations first)", newest: "Newest activity", oldest: "Oldest activity", due: "Due date" }[s]}
              </MenuCheck>
            ))}
          </MenuContent>
        </Menu>
        {!compact && (
          <Tip content="Download this view as CSV">
            <Button size="icon" onClick={() => exportCsv(r, rows)} aria-label="Export CSV">
              <Download className="h-4 w-4" />
            </Button>
          </Tip>
        )}
      </div>

      {/* Bulk bar */}
      {checked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-soft px-4 py-2 text-sm">
          <span className="font-medium text-brand">{checked.length} selected</span>
          <Button size="xs" disabled={!actions.canAct} onClick={() => actions.previewLabels(checked)}>
            <Tag className="h-3.5 w-3.5" /> Preview labels
          </Button>
          <Button size="xs" disabled={!actions.canAct} onClick={() => actions.archive(checked)}>
            <Archive className="h-3.5 w-3.5" /> Mark for archive
          </Button>
          <Button size="xs" variant="danger" disabled={!actions.canAct} onClick={() => actions.escalate(checked)}>
            <TrendingUp className="h-3.5 w-3.5" /> Escalate
          </Button>
          <button onClick={() => setChecked([])} className="ml-auto text-xs text-muted hover:text-fg">
            Clear
          </button>
        </div>
      )}

      {layout === "board" && !compact ? (
        <div className="min-h-0 flex-1">
          <ThreadBoard run={run} threads={rows} onOpen={actions.open} />
        </div>
      ) : (
        <>
      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-subtle/95 backdrop-blur">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
              <th className="w-10 border-b border-line py-2 pl-4">
                <input type="checkbox" aria-label="Select all" checked={allChecked} onChange={() => setChecked(allChecked ? [] : rows.map((t) => t.thread_key))} className="accent-[rgb(var(--brand))]" />
              </th>
              <th className="border-b border-line py-2 pr-3">Thread</th>
              {!compact && <th className="hidden w-44 border-b border-line px-3 py-2 xl:table-cell">Type</th>}
              {!compact && <th className="hidden w-28 border-b border-line px-3 py-2 md:table-cell">Urgency</th>}
              {!compact && <th className="hidden w-36 border-b border-line px-3 py-2 lg:table-cell">Owner</th>}
              {!compact && <th className="hidden w-28 border-b border-line px-3 py-2 lg:table-cell">Due</th>}
              {!compact && <th className="hidden w-28 border-b border-line px-3 py-2 md:table-cell">Age</th>}
              {!compact && <th className="hidden w-56 border-b border-line px-3 py-2 md:table-cell">Next action</th>}
              <th className="w-10 border-b border-line py-2 pr-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const ds = decisionsOf(r, t);
              const latest = ds.at(-1)!;
              const meta = ACTION_META[t.next_action.kind];
              const active = t.thread_key === selected;
              const purposes = [...new Set(ds.map((d) => d.purpose))];
              const review = ds.some((d) => d.review?.needed);
              return (
                <tr
                  key={t.thread_key}
                  onClick={() => actions.open(t.thread_key)}
                  className={cn("group cursor-pointer transition-colors", active ? "bg-brand-soft/70" : "hover:bg-subtle")}
                  aria-selected={active}
                >
                  <td className="relative border-b border-line py-3 pl-4 align-top" onClick={(e) => e.stopPropagation()}>
                    <span className={cn("absolute inset-y-0 left-0 w-[3px]", meta.stripe)} />
                    <input type="checkbox" aria-label={`Select ${t.title}`} checked={checked.includes(t.thread_key)} onChange={() => toggle(t.thread_key)} className="mt-0.5 accent-[rgb(var(--brand))]" />
                  </td>
                  <td className="overflow-hidden border-b border-line py-3 pr-3 align-top">
                    <div className="flex items-center gap-2">
                      <span className={cn("truncate", t.action_needed ? "font-semibold" : "font-medium text-fg/85")}>{t.title}</span>
                      {review && <Badge tone="amber">review</Badge>}
                      {compact && <span className="ml-auto shrink-0 text-[11px] text-muted">{formatReceived(t.last_activity)}</span>}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted">
                      <span className="font-mono">{latest.email_id}</span> · {t.thread_key === "QUARANTINE" ? "content quarantined" : latest.body}
                    </div>
                    <div className={cn("mt-1.5 flex flex-wrap gap-1", !compact && "md:hidden")}>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <UrgencyBadge urgency={topUrgency(ds)} />
                      <AgeBadge days={t.age_days} />
                      {t.owner && <Badge>{t.owner}</Badge>}
                      {t.owner === null && <Badge tone="amber">Unassigned</Badge>}
                      {t.latest_due && <Badge>due {formatDay(t.latest_due).replace(/ d{4}$/, "")}</Badge>}
                    </div>
                  </td>
                  {!compact && (
                    <td className="hidden border-b border-line px-3 py-3 align-top xl:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {purposes.slice(0, 2).map((p) => (
                          <PurposeBadge key={p} purpose={p} />
                        ))}
                        {purposes.length > 2 && <Badge>+{purposes.length - 2}</Badge>}
                      </div>
                    </td>
                  )}
                  {!compact && (
                    <td className="hidden border-b border-line px-3 py-3 align-top md:table-cell">
                      <UrgencyBadge urgency={topUrgency(ds)} />
                    </td>
                  )}
                  {!compact && (
                    <td className="hidden truncate border-b border-line px-3 py-3 align-top lg:table-cell">
                      {t.owner ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Avatar name={t.owner} size="sm" /> {t.owner}
                        </span>
                      ) : t.owner === null ? (
                        <Badge tone="amber">Unassigned</Badge>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  )}
                  {!compact && <td className="hidden whitespace-nowrap border-b border-line px-3 py-3 align-top text-fg/80 lg:table-cell">{t.latest_due ? formatDay(t.latest_due).replace(/ \d{4}$/, "") : <span className="text-muted">-</span>}</td>}
                  {!compact && (
                    <td className="hidden border-b border-line px-3 py-3 align-top md:table-cell">
                      <AgeBadge days={t.age_days} />
                    </td>
                  )}
                  {!compact && (
                    <td className="hidden border-b border-line px-3 py-3 align-top md:table-cell">
                      <Badge tone={meta.tone} className="max-w-full truncate">
                        {t.next_action.label}
                      </Badge>
                    </td>
                  )}
                  <td className="border-b border-line py-2.5 pr-3 align-top" onClick={(e) => e.stopPropagation()}>
                    <Menu>
                      <MenuTrigger asChild>
                        <button className="grid h-7 w-7 place-items-center rounded-md text-muted opacity-60 hover:bg-line/60 hover:text-fg group-hover:opacity-100" aria-label={`Actions for ${t.title}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem icon={<Eye />} onSelect={() => actions.open(t.thread_key)}>
                          Open
                        </MenuItem>
                        <MenuItem icon={<Reply />} disabled={t.draft_mode === "none" || !actions.canAct} onSelect={() => actions.reply(t.thread_key)}>
                          Reply
                        </MenuItem>
                        <MenuItem icon={<TrendingUp />} disabled={!actions.canAct} onSelect={() => actions.escalate([t.thread_key])}>
                          Escalate…
                        </MenuItem>
                        <MenuItem icon={<Eye />} disabled={!actions.canAct} onSelect={() => actions.watch(t.thread_key)}>
                          Watch
                        </MenuItem>
                        <MenuItem icon={<Archive />} disabled={!actions.canAct || t.thread_key === "QUARANTINE"} onSelect={() => actions.archive([t.thread_key])}>
                          Mark for archive
                        </MenuItem>
                        <MenuItem icon={<Tag />} disabled={!actions.canAct} onSelect={() => actions.previewLabels([t.thread_key])}>
                          Preview labels
                        </MenuItem>
                        <MenuSep />
                        <MenuItem icon={<Link2 />} onSelect={() => navigator.clipboard?.writeText(`${window.location.origin}/inbox/${encodeURIComponent(t.thread_key)}`)}>
                          Copy link
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="px-6 py-16 text-center text-sm text-muted">No threads match this view.</div>}
      </div>
        </>
      )}
      <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-muted">
        <span>
          {rows.length} of {r.threads.length} threads · {r.decisions.length} emails
        </span>
        <span className="hidden sm:inline">
          as of {formatReceived(r.as_of)}
        </span>
      </div>
    </section>
  );
}
