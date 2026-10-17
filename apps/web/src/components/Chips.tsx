import type { ReactNode } from "react";
import type { Purpose, TaskStatus, Urgency } from "@c16/core";

const TONES = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  danger: "bg-red-600 text-white ring-red-600",
} as const;

export type Tone = keyof typeof TONES;

export function Chip({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const URGENCY: Record<Urgency, Tone> = { high: "red", medium: "amber", low: "neutral", "n/a": "neutral" };
export const UrgencyChip = ({ urgency }: { urgency: Urgency }) => <Chip tone={URGENCY[urgency]}>{urgency === "n/a" ? "urgency n/a" : `${urgency} urgency`}</Chip>;

const STATUS: Record<TaskStatus, Tone> = { open: "blue", in_progress: "violet", blocked: "orange", closed: "green", quarantined: "danger", needs_review: "amber" };
export const StatusChip = ({ status }: { status: TaskStatus }) => <Chip tone={STATUS[status]}>{status.replace("_", " ")}</Chip>;

const PURPOSE_LABEL: Record<Purpose, string> = {
  request: "request",
  correction: "correction",
  resolution: "resolution",
  duplicate: "duplicate",
  status_update: "status update",
  fyi: "FYI",
  commitment: "sender commitment",
  question: "question",
  blocker: "blocker",
  injection: "injection",
};
export const PurposeChip = ({ purpose }: { purpose: Purpose }) => <Chip tone={purpose === "injection" ? "danger" : "neutral"}>{PURPOSE_LABEL[purpose]}</Chip>;
