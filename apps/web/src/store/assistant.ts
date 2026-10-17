import { create } from "zustand";
import type { MailboxView, MailThread } from "@c16/core";
import { aiAssist, assistantStatus, type AssistResult } from "../lib/ai";
import { nameOf } from "../components/mail/common";

// The AI assistant's state. Results are kept in this tab's memory only: they are derived from email
// content, which the app never writes to browser storage. Only the on/off choices and the ids of review
// items the person has already seen are remembered.

export interface AssistEntry extends AssistResult {
  for_message: string; // the newest message the result covers; a newer message makes it stale
  at: string;
}

const read = <T>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* not kept */
  }
};

interface AssistantStore {
  enabled: boolean; // the person allowed the assistant to read conversations
  notify: boolean; // desktop notifications for review items
  offerDismissed: boolean;
  status: { checked: boolean; server: "none" | "down" | "ok"; available: boolean; model: string | null };
  results: Record<string, AssistEntry>; // thread key → result
  errors: Record<string, string>;
  working: string | null;
  analyzed: number; // this session
  seen: string[]; // review item ids already looked at
  setEnabled(v: boolean): void;
  setNotify(v: boolean): Promise<void>;
  dismissOffer(): void;
  checkStatus(): Promise<void>;
  analyze(view: MailboxView, thread: MailThread, userName: string): Promise<void>;
  markSeen(ids: string[]): void;
}

export const lastMessageId = (t: MailThread) => t.message_ids.at(-1)!;

export const useAssistant = create<AssistantStore>((set, get) => ({
  enabled: read("c16.ai.enabled", false),
  notify: read("c16.ai.notify", false),
  offerDismissed: read("c16.ai.offer_dismissed", false),
  status: { checked: false, server: "none", available: false, model: null },
  results: {},
  errors: {},
  working: null,
  analyzed: 0,
  seen: read<string[]>("c16.review.seen", []),

  setEnabled(v) {
    write("c16.ai.enabled", v);
    set({ enabled: v, errors: {} });
  },
  async setNotify(v) {
    if (v && typeof Notification !== "undefined" && Notification.permission !== "granted") {
      const p = await Notification.requestPermission().catch(() => "denied" as NotificationPermission);
      if (p !== "granted") v = false;
    }
    write("c16.ai.notify", v);
    set({ notify: v });
  },
  dismissOffer() {
    write("c16.ai.offer_dismissed", true);
    set({ offerDismissed: true });
  },
  async checkStatus() {
    const s = await assistantStatus();
    set({ status: { checked: true, server: s.server, available: s.server === "ok" && s.enabled, model: s.model } });
  },
  async analyze(view, thread, userName) {
    const msgs = thread.message_ids.map((id) => view.messages.find((m) => m.id === id)!).filter((m) => !view.insights[m.id]?.suspicious);
    if (!msgs.some((m) => m.direction === "inbound")) return;
    set({ working: thread.key });
    const r = await aiAssist({
      subject: thread.subject.slice(0, 300),
      user_name: userName.slice(0, 80) || "me",
      category: thread.category,
      messages: msgs.slice(-10).map((m) => ({ from: nameOf(m.from).slice(0, 200), direction: m.direction, received_at: m.received_at, body: (m.body || "(empty)").slice(0, 6000) })),
    });
    if (r.status === "ok") set({ results: { ...get().results, [thread.key]: { ...r, for_message: lastMessageId(thread), at: new Date().toISOString() } } });
    else set({ errors: { ...get().errors, [thread.key]: r.error } });
    set({ working: null, analyzed: get().analyzed + 1 });
  },
  markSeen(ids) {
    const seen = [...new Set([...get().seen, ...ids])].slice(-1000);
    write("c16.review.seen", seen);
    set({ seen });
  },
}));
