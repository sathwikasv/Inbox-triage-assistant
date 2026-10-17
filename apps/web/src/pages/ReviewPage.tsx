import { useNavigate } from "react-router-dom";
import { BadgeCheck, ClipboardCheck, Download, FileWarning, MailCheck, PenLine, Save } from "lucide-react";
import { lintDraft, needsApproval } from "@c16/core";
import { useTriage } from "../store/triage";
import { ActivityList } from "../components/inbox/ActivityList";
import { burdenOf, runBurden } from "../lib/burden";
import { Badge, Button, EmptyState } from "../ui";
import { formatStamp } from "../lib/format";
import { ROLES } from "../lib/permissions";

export default function ReviewPage() {
  const { run, busy, markReviewed, repo, role, approveDraft } = useTriage();
  const navigate = useNavigate();
  if (!run) {
    return (
      <div className="card">
        <EmptyState icon={<ClipboardCheck />} title="Nothing to review" action={<Button variant="primary" onClick={() => navigate("/")}>Import an inbox</Button>}>
          Drafts and approvals appear here after an import.
        </EmptyState>
      </div>
    );
  }
  const r = run.result;
  const rows = r.threads
    .filter((t) => t.draft_mode !== "none")
    .map((t) => {
      const edit = run.edits[t.thread_key];
      const body = edit?.body ?? r.drafts.find((d) => d.thread_key === t.thread_key)?.body ?? "";
      const draft = r.drafts.find((d) => d.thread_key === t.thread_key)!;
      return { t, edit, body, lintOk: lintDraft(body, t).ok, must: needsApproval(body, t).needed, approved: run.approvals?.[t.thread_key], reply: run.replies?.[t.thread_key], burden: burdenOf(draft, body) };
    });
  const pending = rows.filter((x) => x.must && !x.approved).length;
  const burden = runBurden(run);
  const handedOff = rows.filter((x) => x.reply).length;
  const replied = rows.filter((x) => x.reply?.replied_at).length;

  function download() {
    const payload = {
      run_id: run!.runId,
      source: run!.source,
      saved_at: run!.savedAt,
      policy: r.policy,
      threads: r.threads,
      decisions: r.decisions,
      drafts: rows.map((x) => ({ thread_key: x.t.thread_key, body: x.body, edited: !!x.edit, approved: x.approved ?? null, correction_burden: x.burden.ratio, handoff: x.reply ?? null })),
      pilot_metrics: { draft_correction_burden_avg: Math.round(burden.avg * 1000) / 1000, drafts_unchanged: burden.unchanged, drafts_edited: burden.edited, missed_critical_items: r.metrics.labels_applied ? r.metrics.seeded_total - r.metrics.seeded_recovered : null },
      decision_edits: run!.decisionEdits,
      audit: run!.audit,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    Object.assign(document.createElement("a"), { href: url, download: `c16-reviewed-${r.fixture_hash}.json` }).click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reply queue</h1>
          <p className="mt-1 text-sm text-muted">Every reply from draft to hand-off: lint, approval, how much people changed it, and whether it was sent from a mail app. The tool itself sends nothing.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={download}>
            <Download className="h-4 w-4" /> Export JSON
          </Button>
          <Button variant="primary" size="md" disabled={busy || role === "viewer"} onClick={markReviewed}>
            <Save className="h-4 w-4" /> Save reviewed result
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="card p-4">
          <div className="text-xs text-muted">Drafts</div>
          <div className="mt-1 text-2xl font-semibold">{rows.length}</div>
          <div className="text-xs text-muted">{rows.filter((x) => x.edit).length} edited by a reviewer</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">Waiting for approval</div>
          <div className="mt-1 text-2xl font-semibold">{pending}</div>
          <div className="text-xs text-muted">dates, commitments or escalations need an Approver</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">Draft correction burden</div>
          <div className="mt-1 text-2xl font-semibold">{burden.edited ? `${Math.round(burden.avg * 100)}%` : "0%"}</div>
          <div className="text-xs text-muted">{burden.unchanged} of {burden.drafts} replies kept as suggested</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">Handed off · replied</div>
          <div className="mt-1 text-2xl font-semibold">
            {handedOff} <span className="text-base text-muted">· {replied}</span>
          </div>
          <div className="text-xs text-muted">copied or .eml, then sent from a mail app</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">Last saved</div>
          <div className="mt-1 text-lg font-semibold">{run.savedAt ? formatStamp(run.savedAt) : "not yet"}</div>
          <div className="text-xs text-muted">{run.reviewed ? `${repo.kind === "api" ? "in MongoDB via the API" : "in this browser"}; survives a reload` : run.savedAt ? "changed since the last save" : "save when the review is done"}</div>
        </div>
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-5 py-4">
          <PenLine className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold">Replies</h2>
          <span className="text-xs text-muted">You are acting as {ROLES[role].label}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-subtle text-left text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-5 py-2 font-semibold">Thread</th>
                <th className="px-3 py-2 font-semibold">Draft</th>
                <th className="px-3 py-2 font-semibold">Lint</th>
                <th className="px-3 py-2 font-semibold">Approval</th>
                <th className="px-3 py-2 font-semibold">Changed</th>
                <th className="px-3 py-2 font-semibold">Hand-off</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((x) => (
                <tr key={x.t.thread_key} className="align-top">
                  <td className="px-5 py-3">
                    <button onClick={() => navigate(`/inbox/${encodeURIComponent(x.t.thread_key)}`)} className="font-medium hover:text-brand">
                      {x.t.title}
                    </button>
                    <div className="font-mono text-[11px] text-muted">{x.t.thread_key}</div>
                  </td>
                  <td className="max-w-md px-3 py-3">
                    <p className="line-clamp-2 text-muted">{x.body.replace(/\s+/g, " ")}</p>
                    <Badge tone={x.edit ? "violet" : "neutral"} className="mt-1">
                      {x.edit ? "edited" : "template"}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={x.lintOk ? "green" : "red"}>{x.lintOk ? "clean" : "blocked"}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    {x.approved ? (
                      <Badge tone="green">
                        <BadgeCheck className="h-3 w-3" /> approved
                      </Badge>
                    ) : x.must ? (
                      <Badge tone="amber">needs approval</Badge>
                    ) : (
                      <Badge>not required</Badge>
                    )}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-muted">{x.edit ? `${Math.round(x.burden.ratio * 100)}%` : "-"}</td>
                  <td className="px-3 py-3">
                    {x.reply?.replied_at ? (
                      <Badge tone="green">
                        <MailCheck className="h-3 w-3" /> replied
                      </Badge>
                    ) : x.reply ? (
                      <Badge tone="blue">{x.reply.how === "eml" ? ".eml draft" : "copied"}</Badge>
                    ) : (
                      <span className="text-xs text-muted">not yet</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {x.must && !x.approved && (
                      <Button size="xs" variant="success" disabled={role !== "approver" || !x.lintOk || busy} onClick={() => approveDraft(x.t.thread_key)} title={role !== "approver" ? "Switch to the Approver role" : undefined}>
                        <BadgeCheck className="h-3.5 w-3.5" /> Approve
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="flex items-center gap-1.5 border-t border-line px-5 py-3 text-xs text-muted">
          <FileWarning className="h-3.5 w-3.5" /> No draft by design: {r.threads.filter((t) => t.draft_mode === "none").map((t) => `${t.title} (${t.draft_reason})`).join("; ")}.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold">Audit trail</h2>
        <ActivityList events={[...run.audit].reverse()} />
      </section>
    </div>
  );
}
