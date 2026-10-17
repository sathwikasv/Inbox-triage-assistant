import { useMemo } from "react";
import { CATEGORY_LABEL, needsApproval, type MailboxState, type MailboxView } from "@c16/core";
import { useMailbox, useMailboxView } from "../store/mailbox";
import { useAssistant, type AssistEntry } from "../store/assistant";

// Everything that needs a person to look before it can move on. The rules raise most items; the AI
// assistant adds its own when it is on. Each item says which one raised it.

export type ReviewKind = "quarantine" | "assistant" | "approval" | "date" | "clash" | "overdue" | "category";
export interface ReviewItem {
  id: string;
  kind: ReviewKind;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  thread_key: string;
  source: "ai" | "rules";
  at: string;
}

const clip = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const RANK = { high: 0, medium: 1, low: 2 } as const;

export function reviewItems(view: MailboxView, state: MailboxState, results: Record<string, AssistEntry>): ReviewItem[] {
  const out: ReviewItem[] = [];
  const add = (i: ReviewItem) => out.some((x) => x.id === i.id) || out.push(i);
  for (const t of view.threads) {
    if (t.archived) continue;
    const lead = [...t.message_ids].reverse().map((id) => view.insights[id]).find(Boolean);
    if (t.category === "spam") {
      if (lead?.suspicious && t.unread) add({ id: `quarantine:${t.key}`, kind: "quarantine", severity: "high", title: /^quarantined:/i.test(t.subject) ? t.subject : `Quarantined: ${t.subject}`, detail: clip(lead.reason), thread_key: t.key, source: "rules", at: t.last_at });
      continue;
    }
    const r = results[t.key];
    if (r?.review.needed && r.for_message === t.message_ids.at(-1))
      add({ id: `assistant:${t.key}:${r.for_message}`, kind: "assistant", severity: "medium", title: `Needs your review: ${t.subject}`, detail: clip(r.review.reasons.map((x) => x.text).join(" · ")), thread_key: t.key, source: r.review.reasons.some((x) => x.source === "ai") ? "ai" : "rules", at: t.last_at });
    const d = state.drafts[t.key];
    if (d && !d.sent_at && !d.approved_at && t.facts) {
      const a = needsApproval(d.body, t.facts);
      if (a.needed) add({ id: `approval:${t.key}:${d.saved_at}`, kind: "approval", severity: "medium", title: `Approver sign-off needed: ${t.subject}`, detail: `Your saved reply ${a.reasons.join(" and ")}.`, thread_key: t.key, source: "rules", at: d.saved_at });
    }
    if (lead?.flags.includes("needs_review")) add({ id: `category:${t.key}`, kind: "category", severity: "low", title: `Check the category: ${t.subject}`, detail: `The rules were not sure this belongs in ${CATEGORY_LABEL[t.category]}.`, thread_key: t.key, source: "rules", at: t.last_at });
  }
  for (const k of view.tasks) {
    if (k.status === "completed") continue;
    if (k.overdue && k.confirmed) add({ id: `overdue:${k.id}`, kind: "overdue", severity: "high", title: `Overdue: ${k.title}`, detail: k.due ? `It was due ${k.due.date}${k.due.time ? ` at ${k.due.time}` : ""}.` : "Its date has passed.", thread_key: k.source.thread_key, source: "rules", at: view.now });
    const note = k.due?.needs_confirmation[0] ?? k.due_note;
    if (note && k.origin === "extracted") add({ id: `date:${k.id}`, kind: "date", severity: "medium", title: `Confirm the date: ${k.title}`, detail: clip(note), thread_key: k.source.thread_key, source: "rules", at: view.now });
  }
  for (const p of view.proposals) {
    if (p.status !== "proposed") continue;
    if (p.conflicts.length) add({ id: `clash:${p.id}`, kind: "clash", severity: "high", title: `Meeting clash: ${p.title}`, detail: `Clashes with ${p.conflicts.join(", ")}. Choose another time before you accept.`, thread_key: p.source.thread_key, source: "rules", at: view.now });
    const note = p.when?.needs_confirmation[0];
    if (note) add({ id: `date:${p.id}`, kind: "date", severity: "medium", title: `Confirm the time: ${p.title}`, detail: clip(note), thread_key: p.source.thread_key, source: "rules", at: view.now });
  }
  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity] || Date.parse(b.at) - Date.parse(a.at));
}

export function useReviewItems() {
  const view = useMailboxView();
  const state = useMailbox((s) => s.state);
  const results = useAssistant((s) => s.results);
  return useMemo(() => reviewItems(view, state, results), [view, state, results]);
}
