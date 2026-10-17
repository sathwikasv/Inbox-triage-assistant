import type { Decision } from "@c16/core";
import { Chip } from "./Chips";
import { useTriage } from "../store/triage";

/** Label/archive suggestions. Clicking only records a preview in the audit trail; no mailbox is touched. */
export function ActionPreview({ d }: { d: Decision }) {
  const preview = useTriage((s) => s.preview);
  const busy = useTriage((s) => s.busy);
  const last = useTriage((s) => [...(s.run?.audit ?? [])].reverse().find((e) => e.email_id === d.email_id && e.type.startsWith("preview")));
  return (
    <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested</span>
        {d.proposed.labels.map((l) => (
          <Chip key={l} tone={l === "Quarantine" ? "danger" : "neutral"}>
            {l}
          </Chip>
        ))}
        <Chip tone={d.proposed.archive ? "green" : "neutral"}>{d.proposed.archive ? "archive" : "keep in inbox"}</Chip>
        <span className="text-xs text-slate-500">{d.proposed.reason}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button disabled={busy} onClick={() => preview(d.email_id, "label")} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-100 disabled:opacity-50">
          Preview labels
        </button>
        <button disabled={busy} onClick={() => preview(d.email_id, "archive")} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-100 disabled:opacity-50">
          Preview archive
        </button>
        {last && <span className="text-xs text-slate-600">{last.detail}</span>}
      </div>
    </div>
  );
}
