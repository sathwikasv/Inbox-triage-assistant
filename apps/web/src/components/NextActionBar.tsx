import { useState } from "react";
import type { NextActionKind, ThreadFacts } from "@c16/core";
import { Icon } from "./Icons";
import { ACTION_STYLE } from "../lib/views";
import { useTriage } from "../store/triage";

const BUTTONS: { kind: Exclude<NextActionKind, "review">; label: string }[] = [
  { kind: "reply", label: "Reply" },
  { kind: "escalate", label: "Escalate" },
  { kind: "watch", label: "Watch" },
  { kind: "archive", label: "Archive" },
];
const TARGETS = ["Ops lead", "Security team", "Finance", "Store manager", "Engineering on-call"];

/** Reply / Escalate / Watch / Archive. The suggested action is highlighted; every action is recorded, never executed. */
export function NextActionBar({ t, onReply }: { t: ThreadFacts; onReply: () => void }) {
  const act = useTriage((s) => s.act);
  const busy = useTriage((s) => s.busy);
  const [escalating, setEscalating] = useState(false);
  const [to, setTo] = useState(t.thread_key === "QUARANTINE" ? "Security team" : "Ops lead");
  const [note, setNote] = useState("");
  const suggested = t.next_action.kind;
  const quarantined = t.thread_key === "QUARANTINE";

  const click = (kind: Exclude<NextActionKind, "review">) => {
    if (kind === "reply") return onReply();
    if (kind === "escalate") return setEscalating((v) => !v);
    act(t.thread_key, kind);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        {BUTTONS.map((b) => {
          const on = b.kind === suggested;
          const disabled = busy || (quarantined && (b.kind === "reply" || b.kind === "archive")) || (b.kind === "reply" && t.draft_mode === "none");
          return (
            <button
              key={b.kind}
              disabled={disabled}
              onClick={() => click(b.kind)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                on ? "bg-slate-900 text-white shadow hover:bg-slate-700" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Icon name={ACTION_STYLE[b.kind].icon} />
              {b.label}
              {on && <span className="ml-0.5 rounded bg-white/20 px-1 text-[10px] uppercase tracking-wide">suggested</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-600">
        <span className="font-medium text-slate-800">{t.next_action.label}.</span> {t.next_action.reason}.
        {suggested === "review" && " Check the type on the email below before acting."}
      </p>

      {escalating && (
        <form
          className="mt-3 grid gap-2 rounded-lg bg-rose-50 p-3 sm:grid-cols-[10rem_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            act(t.thread_key, "escalate", { to, note: note.trim() || undefined });
            setEscalating(false);
            setNote("");
          }}
        >
          <label className="text-xs font-medium text-rose-900">
            Escalate to
            <select value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded border border-rose-200 bg-white px-2 py-1 text-sm">
              {TARGETS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-rose-900">
            Note
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.escalations[0]?.reason ?? "why this needs attention"}
              className="mt-1 w-full rounded border border-rose-200 bg-white px-2 py-1 text-sm"
            />
          </label>
          <button className="self-end rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700">Record escalation</button>
          <p className="text-[11px] text-rose-800 sm:col-span-3">Recorded in the audit trail for the team. No email is sent.</p>
        </form>
      )}
    </div>
  );
}
