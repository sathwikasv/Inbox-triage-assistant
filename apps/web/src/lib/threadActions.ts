import { toast } from "sonner";
import { archiveThread, setCategory, setRead, setStarred, type Category, type MailboxView } from "@c16/core";
import { useApp } from "../store/app";
import { useMailbox } from "../store/mailbox";

const now = () => new Date().toISOString();
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Inbox actions on one or many conversations. Everything is a workspace change; nothing is deleted at the provider. */
export function useThreadActions(view: MailboxView) {
  const apply = useMailbox((s) => s.apply);
  const actor = useApp((s) => s.prefs.name);
  const ids = (keys: string[], inboundOnly = false) =>
    keys.flatMap((k) => {
      const t = view.threads.find((x) => x.key === k);
      return t ? t.message_ids.filter((id) => !inboundOnly || view.messages.find((m) => m.id === id)?.direction === "inbound") : [];
    });

  return {
    archive(keys: string[], archived = true) {
      if (!keys.length) return;
      if (!apply((s) => keys.reduce((a, k) => archiveThread(a, k, archived, actor, now()), s))) return;
      toast(archived ? `${plural(keys.length, "conversation")} archived` : `${plural(keys.length, "conversation")} moved to the inbox`, {
        description: archived ? "Hidden from the inbox here. Nothing is deleted from the mailbox." : undefined,
        action: { label: "Undo", onClick: () => apply((s) => keys.reduce((a, k) => archiveThread(a, k, !archived, actor, now()), s)) },
      });
    },
    markRead(keys: string[], read: boolean) {
      apply((s) => ids(keys, true).reduce((a, id) => setRead(a, id, read), s), keys.length > 1 ? `${plural(keys.length, "conversation")} marked ${read ? "read" : "unread"}` : undefined);
    },
    star(keys: string[], on: boolean) {
      apply((s) => ids(keys).reduce((a, id) => setStarred(a, id, on, actor, now()), s), keys.length > 1 ? `${plural(keys.length, "conversation")} ${on ? "starred" : "unstarred"}` : undefined);
    },
    move(keys: string[], category: Category) {
      const leads = keys.map((k) => [...ids([k], true)].reverse().find((id) => view.insights[id])).filter(Boolean) as string[];
      if (!leads.length) return;
      apply((s) => leads.reduce((a, id) => setCategory(a, id, category, actor, now()), s), `${plural(leads.length, "conversation")} moved`);
    },
  };
}
