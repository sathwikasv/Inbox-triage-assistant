import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../store/app";
import { useMailbox, useMailboxView } from "../store/mailbox";
import { lastMessageId, useAssistant } from "../store/assistant";
import { queue, useThreadContext } from "../lib/folders";
import { useReviewItems } from "../lib/review";
import { setting } from "../lib/providers";

const SESSION_LIMIT = 40; // conversations analysed per session, to stay well inside the model's free quota
const GAP_MS = 2500; // pause between requests

/**
 * Runs in the background while the app is open. When the person has turned the assistant on and the server
 * has a model, it works through the conversations that need them, one at a time, and prepares a summary,
 * a checked reply draft and review flags. It never sends, archives or changes anything.
 * It also raises desktop notifications for new review items, when the person allowed them.
 */
export function AssistantAgent() {
  const view = useMailboxView();
  const state = useMailbox((s) => s.state);
  const restore = useMailbox((s) => s.restore);
  const name = useApp((s) => s.prefs.name);
  const a = useAssistant();
  const ctx = useThreadContext(view, state);
  const items = useReviewItems();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const open = params.get("t");
  const notified = useRef<Set<string> | null>(null);
  const api = setting("api");

  useEffect(() => {
    a.checkStatus();
    restore();
  }, [api]);

  useEffect(() => {
    if (!a.enabled || !a.status.available || a.working || a.analyzed >= SESSION_LIMIT) return;
    const todo = queue(view, ctx);
    const current = todo.find((t) => t.key === open);
    const next = [...(current ? [current] : []), ...todo].find((t) => {
      if (t.category === "spam" || a.errors[t.key]) return false;
      const msgs = t.message_ids.map((id) => ctx.msgById.get(id)!);
      if (!msgs.some((m) => m.direction === "inbound" && !view.insights[m.id]?.suspicious)) return false;
      return a.results[t.key]?.for_message !== lastMessageId(t);
    });
    if (!next) return;
    // the conversation the person has open goes first, without waiting
    const timer = setTimeout(() => a.analyze(view, next, name), a.analyzed && next.key !== open ? GAP_MS : 300);
    return () => clearTimeout(timer);
  }, [view, ctx, a, name, open]);

  useEffect(() => {
    if (notified.current === null) {
      notified.current = new Set(items.map((i) => i.id)); // what was already there when the app opened is not news
      return;
    }
    const fresh = items.filter((i) => !notified.current!.has(i.id));
    for (const i of fresh) notified.current.add(i.id);
    if (!fresh.length || !a.notify || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const i of fresh.slice(0, 3)) {
      const n = new Notification(i.title, { body: i.detail, tag: i.id });
      n.onclick = () => {
        window.focus();
        navigate(`/inbox?t=${encodeURIComponent(i.thread_key)}`);
      };
    }
    if (fresh.length > 3) new Notification(`${fresh.length - 3} more items need your review`, { tag: "triagedesk-more" });
  }, [items, a.notify, navigate]);

  return null;
}
