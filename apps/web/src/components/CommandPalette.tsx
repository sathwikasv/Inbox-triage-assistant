import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import * as DG from "@radix-ui/react-dialog";
import { BarChart3, FlaskConical, Gavel, Inbox, Moon, Search, Settings, ShieldCheck, Sun, Upload, UserCog, ClipboardCheck } from "lucide-react";
import { STARTER_FIXTURE } from "../lib/starter";
import { useTriage } from "../store/triage";
import { ROLES } from "../lib/permissions";
import { ACTION_META, Badge } from "../ui";
import type { Role } from "../repo";

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
  const { run, importFixture, theme, setTheme, setRole } = useTriage();
  const go = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <DG.Root open={open} onOpenChange={onOpenChange}>
      <DG.Portal>
        <DG.Overlay className="fixed inset-0 z-40 bg-nav/40 backdrop-blur-[2px]" />
        <DG.Content className="fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 animate-fade-in overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
          <DG.Title className="sr-only">Command palette</DG.Title>
          <Command label="Command palette" loop>
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="h-4 w-4 text-muted" />
              <Command.Input autoFocus placeholder="Search threads, pages and actions…" className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted" />
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-1">
              <Command.Empty className="px-4 py-8 text-center text-sm text-muted">No results.</Command.Empty>
              {run && (
                <Command.Group heading="Threads" className={group}>
                  {run.result.threads.map((t) => (
                    <Command.Item
                      key={t.thread_key}
                      value={`thread ${t.title} ${t.thread_key} ${t.email_ids.join(" ")}`}
                      onSelect={() => go(() => navigate(`/inbox/${encodeURIComponent(t.thread_key)}`))}
                      className={item}
                    >
                      <Inbox />
                      <span className="flex-1 truncate">{t.title}</span>
                      <Badge tone={ACTION_META[t.next_action.kind].tone}>{ACTION_META[t.next_action.kind].label}</Badge>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Go to" className={group}>
                {[
                  { to: "/inbox", label: "Inbox", icon: <Inbox /> },
                  { to: "/insights", label: "Insights", icon: <BarChart3 /> },
                  { to: "/playground", label: "Test an email", icon: <FlaskConical /> },
                  { to: "/review", label: "Review and approvals", icon: <ClipboardCheck /> },
                  { to: "/judge", label: "Judge view", icon: <Gavel /> },
                  { to: "/settings", label: "Settings, roles and policy", icon: <Settings /> },
                  { to: "/", label: "Data sources", icon: <Upload /> },
                ].map((p) => (
                  <Command.Item key={p.to} value={`go ${p.label}`} onSelect={() => go(() => navigate(p.to))} className={item}>
                    {p.icon}
                    {p.label}
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Actions" className={group}>
                <Command.Item value="load starter fixture import" onSelect={() => go(() => importFixture(STARTER_FIXTURE, "starter fixture (data/fixture/C16/fixture.json)").then(() => navigate("/inbox")))} className={item}>
                  <Upload /> Load the starter fixture
                </Command.Item>
                <Command.Item value="toggle theme dark light" onSelect={() => go(() => setTheme(theme === "dark" ? "light" : "dark"))} className={item}>
                  {theme === "dark" ? <Sun /> : <Moon />} Switch to {theme === "dark" ? "light" : "dark"} mode
                </Command.Item>
                {(Object.keys(ROLES) as Role[]).map((r) => (
                  <Command.Item key={r} value={`role act as ${r}`} onSelect={() => go(() => setRole(r))} className={item}>
                    <UserCog /> Act as {ROLES[r].label}
                  </Command.Item>
                ))}
                <Command.Item value="policy permissions" onSelect={() => go(() => navigate("/settings"))} className={item}>
                  <ShieldCheck /> View the draft-only policy
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </DG.Content>
      </DG.Portal>
    </DG.Root>
  );
}
