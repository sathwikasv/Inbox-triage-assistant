import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import * as DG from "@radix-ui/react-dialog";
import { CalendarDays, Clock, Inbox, LayoutDashboard, ListTodo, Mail, Moon, Search, Settings, Sun } from "lucide-react";
import { useApp } from "../store/app";
import { useMailboxView } from "../store/mailbox";
import { CategoryBadge } from "./mail/common";

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return [open, setOpen] as const;
}

const item = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-subtle [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-muted";
const group = "px-1 py-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const view = useMailboxView();
  const { theme, setTheme } = useApp();
  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };
  return (
    <DG.Root open={open} onOpenChange={onOpenChange}>
      <DG.Portal>
        <DG.Overlay className="fixed inset-0 z-40 bg-nav/40 backdrop-blur-[2px]" />
        <DG.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
          <DG.Title className="sr-only">Search</DG.Title>
          <Command label="Search">
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="h-4 w-4 text-muted" />
              <Command.Input autoFocus placeholder="Search mail, tasks and pages…" className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted" />
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-1">
              <Command.Empty className="px-4 py-6 text-center text-sm text-muted">No results.</Command.Empty>
              <Command.Group heading="Go to" className={group}>
                <Command.Item onSelect={() => go("/dashboard")} className={item}>
                  <LayoutDashboard /> Dashboard
                </Command.Item>
                <Command.Item onSelect={() => go("/inbox")} className={item}>
                  <Inbox /> Inbox
                </Command.Item>
                <Command.Item onSelect={() => go("/tasks")} className={item}>
                  <ListTodo /> Tasks
                </Command.Item>
                <Command.Item onSelect={() => go("/calendar")} className={item}>
                  <CalendarDays /> Calendar
                </Command.Item>
                <Command.Item onSelect={() => go("/follow-ups")} className={item}>
                  <Clock /> Follow-ups
                </Command.Item>
                <Command.Item onSelect={() => go("/settings")} className={item}>
                  <Settings /> Settings and accounts
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Conversations" className={group}>
                {view.threads.map((t) => {
                  const last = view.messages.find((m) => m.id === t.message_ids.at(-1))!;
                  return (
                    <Command.Item key={t.key} value={`${t.subject} ${last.from.name ?? ""} ${last.from.email} ${t.key}`} onSelect={() => go(`/inbox?t=${encodeURIComponent(t.key)}`)} className={item}>
                      <Mail />
                      <span className="min-w-0 flex-1 truncate">{t.subject}</span>
                      <CategoryBadge category={t.category} />
                    </Command.Item>
                  );
                })}
              </Command.Group>
              <Command.Group heading="Tasks" className={group}>
                {view.tasks.map((t) => (
                  <Command.Item key={t.id} value={`task ${t.title}`} onSelect={() => go("/tasks")} className={item}>
                    <ListTodo /> {t.title}
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Preferences" className={group}>
                <Command.Item onSelect={() => setTheme(theme === "dark" ? "light" : "dark")} className={item}>
                  {theme === "dark" ? <Sun /> : <Moon />} Switch to {theme === "dark" ? "light" : "dark"} theme
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </DG.Content>
      </DG.Portal>
    </DG.Root>
  );
}
