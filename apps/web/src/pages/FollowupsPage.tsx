import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlarmClock, Check, Clock, Hourglass, Mail, MailQuestion, X } from "lucide-react";
import { setFollowUp, type FollowUpKind } from "@c16/core";
import { useApp } from "../store/app";
import { useMailbox, useMailboxView } from "../store/mailbox";
import { localTime } from "../components/mail/common";
import { Badge, Button, EmptyState, Menu, MenuContent, MenuItem, MenuTrigger, Segmented, type Tone } from "../ui";

const KIND: Record<FollowUpKind, { label: string; tone: Tone; icon: JSX.Element }> = {
  unreplied: { label: "You haven't replied", tone: "red", icon: <MailQuestion className="h-4 w-4" /> },
  waiting_on_them: { label: "Waiting for a reply", tone: "violet", icon: <Hourglass className="h-4 w-4" /> },
  they_promised: { label: "They promised", tone: "blue", icon: <Clock className="h-4 w-4" /> },
  we_promised: { label: "You promised", tone: "amber", icon: <Clock className="h-4 w-4" /> },
  deadline_soon: { label: "Deadline soon", tone: "amber", icon: <AlarmClock className="h-4 w-4" /> },
  overdue: { label: "Overdue", tone: "solidRed", icon: <AlarmClock className="h-4 w-4" /> },
};

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Follow-ups</h1>
        <p className="mt-1 text-sm text-muted">Conversations that need a nudge: unanswered important mail, replies you are waiting for, promises and deadlines. Nothing is sent automatically.</p>
      </div>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "open", label: `Open ${view.followups.filter((f) => f.status === "open").length}` },
          { value: "snoozed", label: `Snoozed ${view.followups.filter((f) => f.status === "snoozed").length}` },
          { value: "done", label: "Done" },
        ]}
      />
      <section className="card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<Check />} title="Nothing to follow up">
            You are on top of your conversations.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((f) => (
              <li key={f.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                <span className="mt-0.5 text-muted">{KIND[f.kind].icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{f.title}</span>
                    <Badge tone={KIND[f.kind].tone}>{KIND[f.kind].label}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{f.reason}</p>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
                    {f.due && <span>{f.kind === "overdue" ? "Was due" : "Due"} {localTime(f.due, prefs.timezone)}</span>}
                    {f.snoozed_until && <span>Snoozed until {localTime(f.snoozed_until, prefs.timezone)}</span>}
                    <button onClick={() => navigate(`/inbox?t=${encodeURIComponent(f.thread_key)}`)} className="inline-flex items-center gap-1 text-brand hover:underline">
                      <Mail className="h-3 w-3" /> open conversation
                    </button>
                  </div>
                </div>
                {tab === "done" ? (
                  <Button size="xs" variant="ghost" onClick={() => apply((s) => setFollowUp(s, f.id, "open", undefined, prefs.name, new Date().toISOString()), "Reopened")}>
                    Reopen
                  </Button>
                ) : (
                  <div className="flex gap-1.5">
                    <Button size="xs" variant="primary" onClick={() => apply((s) => setFollowUp(s, f.id, "done", undefined, prefs.name, new Date().toISOString()), "Marked done")}>
                      <Check className="h-3.5 w-3.5" /> Done
                    </Button>
                    <Menu>
                      <MenuTrigger asChild>
                        <Button size="xs">
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
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
