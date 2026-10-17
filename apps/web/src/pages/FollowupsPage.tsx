import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlarmClock, Check, Clock, Hourglass, MailQuestion, Reply, X, type LucideIcon } from "lucide-react";
import { setFollowUp, type FollowUpKind } from "@c16/core";
import { useApp } from "../store/app";
import { useMailbox, useMailboxView } from "../store/mailbox";
import { ProviderMark, ago, localTime, nameOf } from "../components/mail/common";
import { Button, EmptyState, Menu, MenuContent, MenuItem, MenuTrigger, Segmented, cn } from "../ui";

const KIND: Record<FollowUpKind, { label: string; hint: string; icon: LucideIcon; tile: string; stripe: string }> = {
  overdue: { label: "Overdue", hint: "The date has passed.", icon: AlarmClock, tile: "bg-red-600 text-white", stripe: "bg-red-600" },
  unreplied: { label: "You haven't replied", hint: "Important mail still waiting for your answer.", icon: MailQuestion, tile: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300", stripe: "bg-red-400" },
  deadline_soon: { label: "Deadline soon", hint: "Due in the next couple of days.", icon: AlarmClock, tile: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300", stripe: "bg-orange-500" },
  we_promised: { label: "You promised", hint: "Things you said you would do.", icon: Clock, tile: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300", stripe: "bg-purple-500" },
  they_promised: { label: "They promised", hint: "Check whether it arrived.", icon: Clock, tile: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", stripe: "bg-sky-500" },
  waiting_on_them: { label: "Waiting for a reply", hint: "You asked; no answer yet.", icon: Hourglass, tile: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", stripe: "bg-amber-400" },
};
const ORDER: FollowUpKind[] = ["overdue", "unreplied", "deadline_soon", "we_promised", "they_promised", "waiting_on_them"];

export default function FollowupsPage() {
  const view = useMailboxView();
  const apply = useMailbox((s) => s.apply);
  const prefs = useApp((s) => s.prefs);
  const navigate = useNavigate();
  const [tab, setTab] = useState<"open" | "snoozed" | "done">("open");
  const rows = view.followups.filter((f) => (tab === "done" ? f.status === "done" || f.status === "dismissed" : f.status === tab));
  const snooze = (id: string, days: number) => {
    const until = new Date(Date.parse(view.now) + days * 86_400_000).toISOString();
    apply((s) => setFollowUp(s, id, "snoozed", until, prefs.name, new Date().toISOString()), `Snoozed for ${days} day${days > 1 ? "s" : ""}`);
  };
  const open = view.followups.filter((f) => f.status === "open");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Follow-ups</h1>
          <p className="mt-1 text-sm text-muted">Conversations that need a nudge: unanswered important mail, replies you are waiting for, promises and deadlines. Nothing is sent automatically.</p>
        </div>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "open", label: `Open ${open.length}` },
            { value: "snoozed", label: `Snoozed ${view.followups.filter((f) => f.status === "snoozed").length}` },
            { value: "done", label: "Done" },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {ORDER.map((k) => {
          const K = KIND[k];
          const n = open.filter((f) => f.kind === k).length;
          return (
            <div key={k} className={cn("rounded-2xl border border-line bg-surface p-3 shadow-card", !n && "opacity-50")}>
              <span className={cn("grid h-8 w-8 place-items-center rounded-xl", K.tile)}>
                <K.icon className="h-4 w-4" />
              </span>
              <div className="mt-2 text-xl font-semibold tabular-nums">{n}</div>
              <div className="text-xs text-muted">{K.label}</div>
            </div>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface shadow-card">
          <EmptyState icon={<Check />} title="Nothing to follow up">
            You are on top of your conversations.
          </EmptyState>
        </div>
      ) : (
        ORDER.filter((k) => rows.some((f) => f.kind === k)).map((k) => {
          const K = KIND[k];
          return (
            <section key={k}>
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="text-sm font-semibold">{K.label}</h2>
                <span className="text-xs text-muted">{K.hint}</span>
              </div>
              <ul className="space-y-2">
                {rows
                  .filter((f) => f.kind === k)
                  .map((f) => {
                    const m = view.messages.find((x) => x.id === f.message_id);
                    const acc = m ? view.accounts.find((a) => a.id === m.account_id) : undefined;
                    return (
                      <li key={f.id} className="relative flex flex-wrap items-center gap-3 overflow-hidden rounded-2xl border border-line bg-surface py-3 pl-5 pr-3 shadow-card">
                        <span className={cn("absolute inset-y-0 left-0 w-1", K.stripe)} />
                        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", K.tile)}>
                          <K.icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <button onClick={() => navigate(`/inbox?t=${encodeURIComponent(f.thread_key)}`)} className="text-left text-sm font-semibold hover:text-brand hover:underline">
                            {f.title}
                          </button>
                          <p className="mt-0.5 text-sm text-muted">{f.reason}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                            {m && acc && (
                              <span className="inline-flex items-center gap-1">
                                <ProviderMark provider={acc.provider} size="xs" /> {m.direction === "outbound" ? `you wrote to ${m.to.map(nameOf).join(", ")}` : nameOf(m.from)} · {ago(m.received_at, view.now)}
                              </span>
                            )}
                            {f.due && (
                              <span className={cn(f.kind === "overdue" && "font-medium text-rose-600")}>
                                {f.kind === "overdue" ? "Was due" : "Due"} {localTime(f.due, prefs.timezone)}
                              </span>
                            )}
                            {f.snoozed_until && <span>Snoozed until {localTime(f.snoozed_until, prefs.timezone)}</span>}
                          </div>
                        </div>
                        {tab === "done" ? (
                          <Button size="xs" variant="ghost" onClick={() => apply((s) => setFollowUp(s, f.id, "open", undefined, prefs.name, new Date().toISOString()), "Reopened")}>
                            Reopen
                          </Button>
                        ) : (
                          <div className="flex gap-1.5">
                            <Button size="xs" className="rounded-full" onClick={() => navigate(`/inbox?t=${encodeURIComponent(f.thread_key)}`)}>
                              <Reply className="h-3.5 w-3.5" /> {f.kind === "waiting_on_them" ? "Nudge" : "Reply"}
                            </Button>
                            <Button size="xs" variant="primary" className="rounded-full" onClick={() => apply((s) => setFollowUp(s, f.id, "done", undefined, prefs.name, new Date().toISOString()), "Marked done")}>
                              <Check className="h-3.5 w-3.5" /> Done
                            </Button>
                            <Menu>
                              <MenuTrigger asChild>
                                <Button size="xs" className="rounded-full">
                                  <Clock className="h-3.5 w-3.5" /> Snooze
                                </Button>
                              </MenuTrigger>
                              <MenuContent>
                                <MenuItem onSelect={() => snooze(f.id, 1)}>Tomorrow</MenuItem>
                                <MenuItem onSelect={() => snooze(f.id, 3)}>In 3 days</MenuItem>
                                <MenuItem onSelect={() => snooze(f.id, 7)}>Next week</MenuItem>
                              </MenuContent>
                            </Menu>
                            <Button size="xs" variant="ghost" aria-label="Dismiss" onClick={() => apply((s) => setFollowUp(s, f.id, "dismissed", undefined, prefs.name, new Date().toISOString()), "Dismissed")}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
