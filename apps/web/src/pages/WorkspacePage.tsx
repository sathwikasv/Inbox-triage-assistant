import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Fact } from "@c16/core";
import { useTriage } from "../store/triage";
import { Icon } from "../components/Icons";
import { Empty, QuarantineBanner } from "../components/Banners";
import { InboxList } from "../components/InboxList";
import { NextActionBar } from "../components/NextActionBar";
import { SummaryCard } from "../components/SummaryCard";
import { AssistantPanel } from "../components/AssistantPanel";
import { Composer } from "../components/Composer";
import { EmailCard } from "../components/EmailCard";
import { StatusChip } from "../components/Chips";
import { VIEWS, decisionsOf, sortThreads } from "../lib/views";

export default function WorkspacePage() {
  const { key } = useParams();
  const navigate = useNavigate();
  const run = useTriage((s) => s.run);
  const aiEnabled = useTriage((s) => s.ai.enabled);
  const actionError = useTriage((s) => s.actionError);
  const [viewId, setViewId] = useState("all");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Fact["evidence"] | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);

  const r = run?.result;
  const view = VIEWS.find((v) => v.id === viewId)!;
  const threads = useMemo(() => {
    if (!r) return [];
    const q = query.trim().toLowerCase();
    const match = (t: (typeof r.threads)[number]) =>
      !q || [t.title, t.thread_key, t.owner ?? "", ...decisionsOf(r, t).map((d) => `${d.email_id} ${d.body} ${d.purpose}`)].join(" ").toLowerCase().includes(q);
    return sortThreads(r, r.threads.filter((t) => view.test(t, decisionsOf(r, t)) && match(t)));
  }, [r, view, query]);
  const selectedKey = key ?? threads[0]?.thread_key;
  const t = r?.threads.find((x) => x.thread_key === selectedKey);
  const open = (k: string) => navigate(`/inbox/${encodeURIComponent(k)}`);

  useEffect(() => {
    setActive(null);
    paneRef.current?.scrollTo({ top: 0 });
  }, [selectedKey]);

  // Keyboard: j/k next/previous thread, "/" search, "r" reply.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = threads.findIndex((x) => x.thread_key === selectedKey);
      if (e.key === "j" && threads[i + 1]) open(threads[i + 1].thread_key);
      else if (e.key === "k" && i > 0) open(threads[i - 1].thread_key);
      else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "r") {
        e.preventDefault();
        composerRef.current?.focus();
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!run || !r) {
    return (
      <div className="p-6">
        <Empty>
          No inbox imported yet. <Link className="text-indigo-700 underline" to="/">Import the fixture</Link> to start.
        </Empty>
      </div>
    );
  }

  const ds = t ? decisionsOf(r, t) : [];
  const draft = t ? r.drafts.find((d) => d.thread_key === t.thread_key) : undefined;
  const show = (e: Fact["evidence"]) => {
    setActive(e);
    document.getElementById(e.email_id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="grid h-full min-h-0 lg:grid-cols-[13.5rem_23rem_minmax(0,1fr)]">
      {/* Views */}
      <nav aria-label="Views" className={`border-b border-slate-200 bg-white lg:border-b-0 lg:border-r ${key ? "hidden lg:block" : ""}`}>
        <div className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:p-3">
          {VIEWS.map((v) => {
            const n = r.threads.filter((x) => v.test(x, decisionsOf(r, x))).length;
            const on = v.id === viewId;
            return (
              <button
                key={v.id}
                onClick={() => setViewId(v.id)}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${on ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-700 hover:bg-slate-100"}`}
              >
                <Icon name={v.icon} className="h-4 w-4" />
                <span>{v.label}</span>
                <span className={`ml-auto rounded-full px-1.5 text-xs tabular-nums ${on ? "bg-indigo-100" : "bg-slate-100 text-slate-600"}`}>{n}</span>
              </button>
            );
          })}
        </div>
        <div className="hidden px-4 pb-4 pt-2 text-[11px] leading-relaxed text-slate-500 lg:block">
          <div className="font-semibold uppercase tracking-wide text-slate-400">Shortcuts</div>
          <kbd className="font-mono">j</kbd>/<kbd className="font-mono">k</kbd> next/previous · <kbd className="font-mono">/</kbd> search · <kbd className="font-mono">r</kbd> reply
        </div>
      </nav>

      {/* Thread list */}
      <section className={`min-h-0 flex-col border-slate-200 bg-white lg:flex lg:border-r ${key ? "hidden" : "flex"}`}>
        <div className="border-b border-slate-100 p-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 focus-within:border-indigo-300 focus-within:bg-white">
            <Icon name="search" className="h-4 w-4 text-slate-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search threads, emails, owners"
              aria-label="Search threads"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>
              {view.label} · {threads.length}
            </span>
            <span>most urgent first</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <InboxList r={r} threads={threads} selected={selectedKey} onSelect={open} />
        </div>
      </section>

      {/* Reading pane */}
      <section ref={paneRef} className={`min-h-0 overflow-y-auto bg-slate-50 ${key ? "block" : "hidden lg:block"}`}>
        {!t ? (
          <div className="p-8 text-center text-sm text-slate-500">Select a thread.</div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4 p-4 lg:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => navigate("/inbox")} className="rounded-md p-1 text-slate-500 hover:bg-slate-200 lg:hidden" aria-label="Back to the list">
                <Icon name="back" className="h-5 w-5" />
              </button>
              <h1 className="text-xl font-semibold tracking-tight">{t.title}</h1>
              <span className="font-mono text-xs text-slate-500">{t.thread_key}</span>
              <StatusChip status={t.status} />
              <span className="text-xs text-slate-500">{t.email_ids.length} email(s)</span>
            </div>
            {t.thread_key === "QUARANTINE" && <QuarantineBanner quarantined={ds} policy={r.policy} />}
            {actionError && (
              <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                {actionError}
              </div>
            )}
            <NextActionBar
              t={t}
              onReply={() => {
                composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                composerRef.current?.focus();
              }}
            />
            <SummaryCard t={t} ds={ds} onShow={show} aiEnabled={aiEnabled} />
            <AssistantPanel t={t} ds={ds} onCite={(id) => show({ email_id: id, quote: "" })} />
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Emails in time order</h2>
              {ds.map((d) => (
                <EmailCard key={d.email_id} d={d} edited={!!run.decisionEdits[d.email_id]} activeQuote={active?.email_id === d.email_id ? active.quote : null} />
              ))}
            </div>
            <Composer ref={composerRef} t={t} draft={draft} edit={run.edits[t.thread_key]} />
          </div>
        )}
      </section>
    </div>
  );
}
