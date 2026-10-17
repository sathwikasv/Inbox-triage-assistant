import { useEffect, useState } from "react";
import { CircleAlert, TrendingUp } from "lucide-react";
import type { TriageResult } from "@c16/core";
import { Button, Dialog, cn } from "../../ui";

const TARGETS = [
  { name: "Ops lead", hint: "owners, deadlines" },
  { name: "Security team", hint: "suspicious mail" },
  { name: "Engineering on-call", hint: "blocked work" },
  { name: "Finance", hint: "money matters" },
  { name: "Store manager", hint: "store issues" },
];

export function EscalateDialog({ r, keys, onClose, onConfirm }: { r: TriageResult; keys: string[]; onClose: () => void; onConfirm: (to: string, note: string) => void }) {
  const threads = r.threads.filter((t) => keys.includes(t.thread_key));
  const [to, setTo] = useState("Ops lead");
  const [note, setNote] = useState("");
  useEffect(() => {
    setTo(threads.some((t) => t.thread_key === "QUARANTINE") ? "Security team" : threads.some((t) => t.status === "blocked") ? "Engineering on-call" : "Ops lead");
    setNote("");
  }, [keys.join(",")]);

  return (
    <Dialog
      open={keys.length > 0}
      onOpenChange={(o) => !o && onClose()}
      title={
        <span className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-rose-500" /> Escalate {threads.length > 1 ? `${threads.length} threads` : threads[0]?.title}
        </span>
      }
      description="Recorded in the audit trail for the team. No email is sent."
    >
      {threads.some((t) => t.escalations.length) && (
        <ul className="mb-4 space-y-1.5 rounded-xl bg-rose-500/[0.06] p-3">
          {threads.flatMap((t) =>
            t.escalations.map((e) => (
              <li key={t.thread_key + e.code} className="flex items-start gap-2 text-sm">
                <CircleAlert className={cn("mt-0.5 h-4 w-4 shrink-0", e.severity === "high" ? "text-rose-500" : "text-amber-500")} />
                <span>
                  {threads.length > 1 && <b>{t.title}: </b>}
                  {e.reason}
                </span>
              </li>
            )),
          )}
        </ul>
      )}
      <div className="label-xs mb-2">Escalate to</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TARGETS.map((x) => (
          <button
            key={x.name}
            onClick={() => setTo(x.name)}
            className={cn("rounded-xl border p-2.5 text-left text-sm transition", to === x.name ? "border-brand bg-brand-soft ring-2 ring-brand/20" : "border-line hover:bg-subtle")}
          >
            <div className="font-medium">{x.name}</div>
            <div className="text-xs text-muted">{x.hint}</div>
          </button>
        ))}
      </div>
      <label className="label-xs mb-2 mt-4 block" htmlFor="esc-note">
        Note
      </label>
      <textarea id="esc-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={threads[0]?.escalations[0]?.reason ?? "What needs attention?"} className="w-full rounded-xl border border-line bg-canvas/40 p-3 text-sm outline-none focus:border-brand/50 focus:bg-surface" />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" onClick={() => onConfirm(to, note.trim())}>
          <TrendingUp className="h-4 w-4" /> Record escalation
        </Button>
      </div>
    </Dialog>
  );
}
