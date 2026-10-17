import { useMemo } from "react";
import { CATEGORY_LABEL, type Category, type MailboxState, type MailboxView, type MailMessage, type MailThread } from "@c16/core";
import { PRIORITY_ORDER } from "../components/mail/common";

export type Folder = "inbox" | "review" | "drafts" | "sent" | "archive" | "starred" | Category;
export const FOLDER_LABEL: Record<Folder, string> = { inbox: "Inbox", review: "Needs review", drafts: "Drafts", sent: "Sent", archive: "Archive", starred: "Starred", ...CATEGORY_LABEL };

/** Categories that ask something of the person, in the order they are worked through. */
export const ACTIONABLE: Category[] = ["urgent", "requires_action", "to_delegate", "meetings", "follow_up"];

export interface ThreadContext {
  msgById: Map<string, MailMessage>;
  drafts: MailboxState["drafts"];
  outbound: Set<string>;
  starred: Set<string>;
  attachments: Set<string>;
}

export function threadContext(view: MailboxView, state: MailboxState): ThreadContext {
  const msgById = new Map(view.messages.map((m) => [m.id, m]));
  const outbound = new Set<string>();
  const starred = new Set<string>();
  const attachments = new Set<string>();
  for (const t of view.threads)
    for (const id of t.message_ids) {
      const m = msgById.get(id)!;
      if (m.direction === "outbound") outbound.add(t.key);
      if (state.starred[id] ?? m.starred) starred.add(t.key);
      if (m.attachments.length) attachments.add(t.key);
    }
  return { msgById, drafts: state.drafts, outbound, starred, attachments };
}

export function useThreadContext(view: MailboxView, state: MailboxState) {
  return useMemo(() => threadContext(view, state), [view, state]);
}

export function inFolder(t: MailThread, folder: Folder, ctx: Pick<ThreadContext, "drafts" | "outbound" | "starred"> & { review?: Set<string> }) {
  switch (folder) {
    case "inbox":
      return !t.archived && t.category !== "spam";
    case "review":
      return !!ctx.review?.has(t.key);
    case "drafts":
      return !!ctx.drafts[t.key] && !ctx.drafts[t.key].sent_at;
    case "sent":
      return ctx.outbound.has(t.key);
    case "archive":
      return t.archived;
    case "starred":
      return ctx.starred.has(t.key);
    case "spam":
      return t.category === "spam";
    default:
      return !t.archived && t.category === folder;
  }
}

/** Has the person already replied to the newest inbound email? */
export const replied = (t: MailThread, ctx: Pick<ThreadContext, "drafts">) => !!ctx.drafts[t.key]?.sent_at || t.last_direction === "outbound";

/** The conversations that still need the person, most pressing first. */
export function queue(view: MailboxView, ctx: Pick<ThreadContext, "drafts">) {
  return view.threads
    .filter((t) => !t.archived && ACTIONABLE.includes(t.category) && !replied(t, ctx))
    .sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) || ACTIONABLE.indexOf(a.category) - ACTIONABLE.indexOf(b.category) || b.unread - a.unread || Date.parse(b.last_at) - Date.parse(a.last_at));
}
