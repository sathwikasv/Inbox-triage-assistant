import { useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { Toaster } from "sonner";
import { AlertTriangle, Archive, CalendarClock, CalendarDays, ChevronDown, Clock, FileEdit, Hourglass, Inbox, LayoutDashboard, ListTodo, Menu as MenuIcon, Moon, Search, Send, Settings, ShieldAlert, Sun, Tag, UserCheck, Users, X, type LucideIcon } from "lucide-react";
import type { Role } from "@c16/core";
import DashboardPage from "./pages/DashboardPage";
import InboxPage, { inFolder, type Folder } from "./pages/InboxPage";
import TasksPage from "./pages/TasksPage";
import CalendarPage from "./pages/CalendarPage";
import FollowupsPage from "./pages/FollowupsPage";
import SettingsPage from "./pages/SettingsPage";
import { CommandPalette, useCommandPalette } from "./components/CommandPalette";
import { useApp } from "./store/app";
import { useMailbox, useMailboxView } from "./store/mailbox";
import { ROLES } from "./lib/permissions";
import { ProviderMark } from "./components/mail/common";
import { Avatar, Kbd, Menu, MenuCheck, MenuContent, MenuLabel, MenuTrigger, TipProvider, cn } from "./ui";

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const view = useMailboxView();
  const { state } = useMailbox();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const folder = pathname === "/inbox" ? ((params.get("view") ?? "inbox") as Folder) : null;
  const account = params.get("account");
  const outbound = new Set<string>();
  const starred = new Set<string>();
  for (const t of view.threads)
    for (const id of t.message_ids) {
      const m = view.messages.find((x) => x.id === id)!;
      if (m.direction === "outbound") outbound.add(t.key);
      if (state.starred[id] ?? m.starred) starred.add(t.key);
    }
  const ctx = { drafts: state.drafts, outbound, starred };
  const count = (f: Folder) => view.threads.filter((t) => inFolder(t, f, ctx)).length;
  const unread = (f: Folder) => view.threads.filter((t) => inFolder(t, f, ctx)).reduce((n, t) => n + t.unread, 0);
  const pendingTasks = view.tasks.filter((t) => t.status !== "completed").length;
  const followups = view.followups.filter((f) => f.status === "open").length;

  const item = (active: boolean) => cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors", active ? "bg-brand-soft font-semibold text-brand" : "text-fg/80 hover:bg-subtle");
  const F = ({ f, icon: Icon, label, n }: { f: Folder; icon: LucideIcon; label: string; n?: number }) => (
    <Link to={f === "inbox" ? "/inbox" : `/inbox?view=${f}`} onClick={onNavigate} className={item(folder === f && !account)}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {!!n && <span className="text-xs tabular-nums text-muted">{n}</span>}
    </Link>
  );
  const P = ({ to, icon: Icon, label, n }: { to: string; icon: LucideIcon; label: string; n?: number }) => (
    <NavLink to={to} onClick={onNavigate} className={({ isActive }) => item(isActive)}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {!!n && <span className="text-xs tabular-nums text-muted">{n}</span>}
    </NavLink>
  );

  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <div className="space-y-0.5">
        <P to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
        <F f="inbox" icon={Inbox} label="Inbox" n={unread("inbox")} />
        <div className="ml-4 space-y-0.5 border-l border-line pl-2">
          <F f="urgent" icon={AlertTriangle} label="Urgent" n={count("urgent")} />
          <F f="requires_action" icon={UserCheck} label="Requires action" n={count("requires_action")} />
          <F f="to_delegate" icon={Users} label="To delegate" n={count("to_delegate")} />
          <F f="meetings" icon={CalendarClock} label="Meetings" n={count("meetings")} />
          <F f="waiting" icon={Hourglass} label="Waiting" n={count("waiting")} />
          <F f="promotions" icon={Tag} label="Promotions" n={count("promotions")} />
        </div>
      </div>
      <div className="space-y-0.5">
        <P to="/tasks" icon={ListTodo} label="Tasks" n={pendingTasks} />
        <P to="/calendar" icon={CalendarDays} label="Calendar" />
        <P to="/follow-ups" icon={Clock} label="Follow-ups" n={followups} />
      </div>
      <div className="space-y-0.5">
        <F f="drafts" icon={FileEdit} label="Drafts" n={count("drafts")} />
        <F f="sent" icon={Send} label="Sent" />
        <F f="archive" icon={Archive} label="Archive" />
        <F f="spam" icon={ShieldAlert} label="Spam" n={count("spam")} />
      </div>
      <div>
        <div className="label-xs px-2.5 pb-1">Accounts</div>
        {view.accounts.map((a) => (
          <Link key={a.id} to={`/inbox?account=${encodeURIComponent(a.id)}`} onClick={onNavigate} className={item(account === a.id)}>
            <ProviderMark provider={a.provider} size="xs" />
            <span className="min-w-0 flex-1 truncate">{a.address}</span>
            {a.mode === "demo" && <span className="text-[10px] uppercase tracking-wide text-amber-600">demo</span>}
          </Link>
        ))}
        <Link to="/settings" onClick={onNavigate} className="mt-1 block px-2.5 text-xs font-medium text-brand hover:underline">
          + Connect an account
        </Link>
      </div>
      <div className="mt-auto">
        <P to="/settings" icon={Settings} label="Settings" />
      </div>
    </nav>
  );
}

function TopBar({ onSearch, onMenu }: { onSearch: () => void; onMenu: () => void }) {
  const { theme, setTheme, role, setRole, prefs } = useApp();
  return (
    <header className="z-30 flex h-14 shrink-0 items-center gap-3 bg-nav px-3 text-white">
      <button onClick={onMenu} className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10 lg:hidden" aria-label="Open navigation">
        <MenuIcon className="h-5 w-5" />
      </button>
      <Link to="/dashboard" className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-400 to-violet-500 shadow-sm">
          <Inbox className="h-4 w-4" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">Triagedesk</span>
      </Link>
      <button onClick={onSearch} className="mx-auto hidden h-9 w-full max-w-md items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white/55 hover:bg-white/10 md:flex">
        <Search className="h-4 w-4" />
        Search mail, tasks and pages…
        <span className="ml-auto rounded border border-white/15 px-1.5 py-px font-mono text-[10px]">Ctrl K</span>
      </button>
      <div className="ml-auto flex items-center gap-1.5 md:ml-0">
        <button onClick={onSearch} className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10 md:hidden" aria-label="Search">
          <Search className="h-4 w-4" />
        </button>
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10" aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <Menu>
          <MenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-white/10" aria-label="Account and role">
              <Avatar name={prefs.name} size="sm" />
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-xs font-medium">{prefs.name}</span>
                <span className="block text-[10px] text-white/55">{ROLES[role].label}</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-white/50" />
            </button>
          </MenuTrigger>
          <MenuContent>
            <MenuLabel>Act as</MenuLabel>
            {(Object.keys(ROLES) as Role[]).map((r) => (
              <MenuCheck key={r} checked={role === r} onSelect={() => setRole(r)}>
                <span>
                  <span className="block font-medium">{ROLES[r].label}</span>
                  <span className="block max-w-[15rem] text-xs text-muted">{ROLES[r].description}</span>
                </span>
              </MenuCheck>
            ))}
          </MenuContent>
        </Menu>
      </div>
    </header>
  );
}

export default function App() {
  const theme = useApp((s) => s.theme);
  const { pathname } = useLocation();
  const [paletteOpen, setPaletteOpen] = useCommandPalette();
  const [menu, setMenu] = useState(false);
  const fullBleed = pathname.startsWith("/inbox");

  return (
    <TipProvider>
      <div className="flex h-screen flex-col bg-canvas">
        <TopBar onSearch={() => setPaletteOpen(true)} onMenu={() => setMenu(true)} />
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-60 shrink-0 border-r border-line bg-surface lg:block">
            <Sidebar />
          </aside>
          {menu && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <div className="absolute inset-0 bg-nav/40" onClick={() => setMenu(false)} />
              <aside className="absolute inset-y-0 left-0 w-72 bg-surface shadow-pop">
                <button onClick={() => setMenu(false)} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg hover:bg-subtle" aria-label="Close navigation">
                  <X className="h-4 w-4" />
                </button>
                <Sidebar onNavigate={() => setMenu(false)} />
              </aside>
            </div>
          )}
          <main className={cn("min-w-0 flex-1", fullBleed ? "min-h-0" : "overflow-y-auto")}>
            <div className={fullBleed ? "h-full" : "mx-auto w-full max-w-6xl px-4 py-6 lg:px-8"}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/inbox" element={<InboxPage />} />
                <Route path="/tasks" element={<TasksPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/follow-ups" element={<FollowupsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </div>
          </main>
        </div>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <Toaster position="bottom-right" theme={theme} richColors closeButton />
        <span className="sr-only">
          Press <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> to search
        </span>
      </div>
    </TipProvider>
  );
}
