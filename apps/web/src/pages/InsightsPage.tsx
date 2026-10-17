import { useNavigate } from "react-router-dom";
import { AlertTriangle, BarChart3, CheckCircle2, Eye, Inbox, ListChecks, Reply, ShieldAlert, TrendingUp, Archive, PenLine } from "lucide-react";
import type { NextActionKind, Purpose } from "@c16/core";
import { useTriage } from "../store/triage";
import { decisionsOf, topUrgency } from "../lib/views";
import { formatReceived } from "../lib/format";
import { BarList, ChartCard, Columns, Meter, StackedBar, StatTile } from "../components/charts";
import { AgeBadge, Badge, Button, EmptyState, PURPOSE_LABEL, PurposeBadge, UrgencyBadge } from "../ui";
import { labelsFor } from "../lib/starter";

const ACTION_ICON: Record<NextActionKind, JSX.Element> = { escalate: <TrendingUp />, review: <ListChecks />, reply: <Reply />, watch: <Eye />, archive: <Archive /> };
const ACTION_LABEL: Record<NextActionKind, string> = { escalate: "Escalate", review: "Review type", reply: "Reply", watch: "Watch", archive: "Archive" };

export default function InsightsPage() {
  const run = useTriage((s) => s.run);
  const navigate = useNavigate();
  if (!run) {
    return (
      <div className="card">
        <EmptyState icon={<BarChart3 />} title="No data yet" action={<Button variant="primary" onClick={() => navigate("/")}>Import an inbox</Button>}>
          Insights appear once an inbox has been triaged.
        </EmptyState>
      </div>
    );
  }
  const r = run.result;
  const m = r.metrics;
  const threads = r.threads;
  const actionNow = threads.filter((t) => t.action_needed && t.thread_key !== "QUARANTINE").length;
  const escalations = threads.filter((t) => t.next_action.kind === "escalate" || t.escalations.length);
  const review = r.decisions.filter((d) => d.review?.needed).length + threads.reduce((n, t) => n + t.inferred_links.length, 0);
  const drafts = r.drafts.length;
  const edited = Object.keys(run.edits).length;
  const approved = Object.keys(run.approvals ?? {}).length;

  const byType = (Object.keys(PURPOSE_LABEL) as Purpose[]).map((p) => ({ label: PURPOSE_LABEL[p], value: r.decisions.filter((d) => d.purpose === p).length })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  const urg = (u: string) => r.decisions.filter((d) => d.urgency === u).length;
  const hours = [...new Set(r.decisions.filter((d) => d.received_at).map((d) => d.received_at!.slice(11, 13)))].sort();
  const firstH = Number(hours[0] ?? 8);
  const lastH = Number(hours.at(-1) ?? 17);
  const arrivals = Array.from({ length: lastH - firstH + 1 }, (_, i) => {
    const h = String(firstH + i).padStart(2, "0");
    const ds = r.decisions.filter((d) => d.received_at?.slice(11, 13) === h);
    return { label: `${h}:00`, value: ds.length, detail: ds.map((d) => d.email_id).join(" ") };
  });
  const actions = (["escalate", "review", "reply", "watch", "archive"] as NextActionKind[]).map((k) => ({ label: ACTION_LABEL[k], value: threads.filter((t) => t.next_action.kind === k).length, icon: ACTION_ICON[k] }));
  const withAi = r.decisions.filter((d) => d.ai);
  const aiAgree = withAi.filter((d) => d.ai!.decided_by === "both").length;
  const hasLabels = !!labelsFor(r.fixture_hash);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
          <p className="mt-1 text-sm text-muted">
            {r.decisions.length} emails in {threads.length} threads · as of {formatReceived(r.as_of)} · {run.source}
          </p>
        </div>
        <Button onClick={() => navigate("/inbox")}>
          <Inbox className="h-4 w-4" /> Open inbox
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Need action now" value={actionNow} caption={`of ${threads.length} threads`} icon={<Reply />} />
        <StatTile label="Escalations" value={escalations.length} caption="no owner, security, blocked" icon={<AlertTriangle />} accent="red" />
        <StatTile label="Needs review" value={review} caption="uncertain type or inferred link" icon={<ListChecks />} accent="amber" />
        <StatTile label="Drafts ready" value={drafts} caption={`${edited} edited · ${approved} approved`} icon={<PenLine />} />
        <StatTile label="Resolved" value={threads.filter((t) => t.status === "closed").length} caption="chasers suppressed" icon={<CheckCircle2 />} accent="green" />
        <StatTile label="Quarantined" value={r.decisions.filter((d) => d.status === "quarantined").length} caption={`policy auto_send: ${r.policy.auto_send}`} icon={<ShieldAlert />} accent="red" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Emails by type" subtitle="What the inbox is asking for" table={{ head: ["Type", "Emails"], rows: byType.map((b) => [b.label, b.value]) }}>
          <BarList rows={byType} />
        </ChartCard>
        <ChartCard
          title="Urgency mix"
          subtitle="Share of emails by urgency; labels carry the meaning, not colour alone"
          table={{ head: ["Urgency", "Emails"], rows: [["High", urg("high")], ["Medium", urg("medium")], ["Low", urg("low")], ["Not ranked (quarantined)", urg("n/a")]] }}
        >
          <StackedBar
            segments={[
              { label: "High", value: urg("high"), color: "rgb(var(--status-critical))" },
              { label: "Medium", value: urg("medium"), color: "rgb(var(--status-warning))" },
              { label: "Low", value: urg("low"), color: "rgb(var(--status-neutral))" },
              { label: "Not ranked", value: urg("n/a"), color: "rgb(var(--status-neutral) / 0.4)" },
            ]}
          />
          <div className="mt-5 border-t border-line pt-4">
            <div className="label-xs mb-2">High urgency right now</div>
            <ul className="divide-y divide-line">
              {r.decisions
                .filter((d) => d.urgency === "high")
                .map((d) => (
                  <li key={d.email_id}>
                    <button onClick={() => navigate(`/inbox/${encodeURIComponent(d.thread_key)}#${d.email_id}`)} className="flex w-full items-center gap-3 py-2 text-left text-sm hover:text-brand">
                      <span className="w-9 font-mono text-xs font-semibold">{d.email_id}</span>
                      <PurposeBadge purpose={d.purpose} />
                      <span className="flex-1 truncate text-muted">{d.explain.urgency}</span>
                    </button>
                  </li>
                ))}
            </ul>
            <p className="mt-3 text-xs text-muted">High urgency: due within 3 days, no owner, blocked, or a correction to an open commitment.</p>
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <ChartCard className="lg:col-span-3" title="Arrivals through the day" subtitle="Emails received per hour (sender's time zone)" table={{ head: ["Hour", "Emails", "Ids"], rows: arrivals.map((a) => [a.label, a.value, a.detail ?? ""]) }}>
          <Columns data={arrivals} />
        </ChartCard>
        <ChartCard className="lg:col-span-2" title="Next actions" subtitle="Suggested action per thread" table={{ head: ["Action", "Threads"], rows: actions.map((a) => [a.label, a.value]) }}>
          <BarList rows={actions} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="card overflow-hidden lg:col-span-3">
          <div className="border-b border-line px-5 py-4">
            <h3 className="text-sm font-semibold">Escalation queue</h3>
            <p className="mt-0.5 text-xs text-muted">Threads that need someone with authority</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-5 py-2 font-semibold">Thread</th>
                <th className="px-3 py-2 font-semibold">Reason</th>
                <th className="px-3 py-2 font-semibold">Urgency</th>
                <th className="px-3 py-2 font-semibold">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {escalations.map((t) => (
                <tr key={t.thread_key} onClick={() => navigate(`/inbox/${encodeURIComponent(t.thread_key)}`)} className="cursor-pointer hover:bg-subtle">
                  <td className="px-5 py-2.5 font-medium">{t.title}</td>
                  <td className="px-3 py-2.5 text-muted">{t.escalations.map((e) => e.reason).join("; ") || t.next_action.reason}</td>
                  <td className="px-3 py-2.5">
                    <UrgencyBadge urgency={topUrgency(decisionsOf(r, t))} />
                  </td>
                  <td className="px-3 py-2.5">
                    <AgeBadge days={t.age_days} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {escalations.length === 0 && <p className="px-5 py-6 text-sm text-muted">Nothing to escalate.</p>}
        </section>

        <section className="card space-y-4 p-5 lg:col-span-2">
          <div>
            <h3 className="text-sm font-semibold">Triage quality</h3>
            <p className="mt-0.5 text-xs text-muted">{hasLabels ? "Against our ground-truth labels for the starter fixture" : "Changed input: label-based scores do not apply"}</p>
          </div>
          {hasLabels && m.labels_applied ? (
            <>
              <Meter label="Seeded critical items recovered" value={m.seeded_recovered} max={m.seeded_total} />
              <Meter label="Action-flag precision" value={m.precision_action_flags} max={1} display={`${Math.round(m.precision_action_flags * 100)}%`} />
              <Meter label="Remaining decisions correct" value={m.remaining_accuracy} max={1} display={`${Math.round(m.remaining_accuracy * 100)}%`} />
              <Meter label="Thread grouping agreement" value={m.thread_pair_agreement} max={1} display={`${Math.round(m.thread_pair_agreement * 100)}%`} />
            </>
          ) : (
            <p className="text-sm text-muted">Compare with the expected behaviour in data/challenges/README.md.</p>
          )}
          <Meter label={withAi.length ? "AI agrees with the rules" : "AI type check"} value={aiAgree} max={withAi.length || 1} display={withAi.length ? `${aiAgree}/${withAi.length}` : "off"} />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {m.checks.map((c) => (
              <Badge key={c.id} tone={c.passed === null ? "neutral" : c.passed ? "green" : "red"}>
                Check {c.id}: {c.passed === null ? "n/a" : c.passed ? "pass" : "fail"}
              </Badge>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
