import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Toaster } from "sonner";
import {
  Archive,
  CalendarDays,
  ChevronDown,
  Clock,
  Command as CommandIcon,
  FilePen,
  HelpCircle,
  Inbox,
  LogIn,
  LogOut,
  Rocket,
  Loader2,
  MessageSquareWarning,
  LayoutDashboard,
  ListTodo,
  Mail,
  Menu as MenuIcon,
  Moon,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Star,
  Sun,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Category, Role } from "@c16/core";
import DashboardPage from "./pages/DashboardPage";
import InboxPage from "./pages/InboxPage";
import TasksPage from "./pages/TasksPage";
import CalendarPage from "./pages/CalendarPage";
import FollowupsPage from "./pages/FollowupsPage";
import SettingsPage from "./pages/SettingsPage";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import { OnboardingDialog, useSetupGuide } from "./components/OnboardingDialog";
import { canEnter, useAuth } from "./store/auth";
import { CommandPalette, useCommandPalette } from "./components/CommandPalette";
import { ShortcutsDialog } from "./components/ShortcutsDialog";
import { NotificationBell } from "./components/NotificationBell";
import { AssistantAgent } from "./components/AssistantAgent";
import { useAssistant } from "./store/assistant";
import { useReviewItems } from "./lib/review";
import { useApp } from "./store/app";
import { useMailbox, useMailboxView } from "./store/mailbox";
import { ROLES } from "./lib/permissions";
import { inFolder, queue, useThreadContext, type Folder } from "./lib/folders";
import { CAT, CATS, ProviderMark } from "./components/mail/common";
import { Avatar, Kbd, Menu, MenuCheck, MenuContent, MenuItem, MenuLabel, MenuSep, MenuTrigger, Tip, TipProvider, cn } from "./ui";

const LABELS: Category[] = CATS.filter((c) => c !== "spam");

function Sidebar({ rail, onNavigate }: { rail: boolean; onNavigate?: () => void }) {
  const view = useMailboxView();
  const { state } = useMailbox();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const base = useThreadContext(view, state);
  const reviewItems = useReviewItems();
  const ctx = { ...base, review: new Set(reviewItems.map((i) => i.thread_key)) };
  const folder = pathname === "/inbox" ? ((params.get("view") ?? "inbox") as Folder) : null;
  const account = params.get("account");
  const count = (f: Folder) => view.threads.filter((t) => inFolder(t, f, ctx)).length;
  const unread = (f: Folder) => view.threads.filter((t) => inFolder(t, f, ctx)).reduce((n, t) => n + t.unread, 0);
  const pendingTasks = view.tasks.filter((t) => t.status !== "completed").length;
  const followups = view.followups.filter((f) => f.status === "open").length;
  const todo = queue(view, ctx);
  const [allLabels, setAllLabels] = useState(false);

  const row = (active: boolean) =>
    cn(
      "group flex h-8 w-full items-center gap-3 rounded-full text-sm transition-colors",
      rail ? "justify-center px-0" : "pl-4 pr-3",
      active ? "bg-brand-soft font-semibold text-fg" : "text-fg/80 hover:bg-fg/[0.06]",
    );
  const Count = ({ n, strong }: { n?: number; strong?: boolean }) => (!n || rail ? null : <span className={cn("ml-auto text-xs tabular-nums", strong ? "font-bold text-fg" : "text-muted")}>{n}</span>);
  const wrap = (label: string, node: JSX.Element) =>
    rail ? (
      <Tip key={label} content={label} side="right">
        {node}
      </Tip>
    ) : (
      node
    );
  const F = ({ f, icon: Icon, label, n, strong, dot }: { f: Folder; icon?: LucideIcon; label: string; n?: number; strong?: boolean; dot?: string }) =>
    wrap(
      label,
      <Link to={f === "inbox" ? "/inbox" : `/inbox?view=${f}`} onClick={onNavigate} className={row(folder === f && !account)} aria-label={rail ? label : undefined}>
        {dot ? <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dot, rail && "h-3 w-3")} /> : Icon && <Icon className="h-[18px] w-[18px] shrink-0" />}
        {!rail && <span className="truncate">{label}</span>}
        <Count n={n} strong={strong} />
      </Link>,
    );
  const P = ({ to, icon: Icon, label, n }: { to: string; icon: LucideIcon; label: string; n?: number }) =>
    wrap(
      label,
      <NavLink to={to} onClick={onNavigate} className={({ isActive }) => row(isActive)} aria-label={rail ? label : undefined}>
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {!rail && <span className="truncate">{label}</span>}
        <Count n={n} />
      </NavLink>,
    );
  const Heading = ({ children }: { children: string }) => (rail ? <div className="mx-auto my-1 h-px w-8 bg-line" /> : <div className="label-xs px-4 pb-1 pt-3">{children}</div>);

  return (
    <nav aria-label="Main" className={cn("flex h-full flex-col overflow-y-auto pb-3", rail ? "px-2" : "pl-2 pr-3")}>
      <div className={cn("pb-3 pt-1", rail && "flex justify-center")}>
        {wrap(
          "Open the most pressing conversation",
          <button
            onClick={() => {
              if (todo[0]) navigate(`/inbox?t=${encodeURIComponent(todo[0].key)}`);
              onNavigate?.();
            }}
            disabled={!todo.length}
            className={cn(
              "flex items-center gap-3 rounded-2xl bg-brand-soft text-sm font-semibold text-fg shadow-card transition hover:shadow-pop disabled:opacity-60",
              rail ? "h-12 w-12 justify-center" : "h-14 w-full px-5",
            )}
            aria-label={rail ? "Triage next" : undefined}
          >
            <Sparkles className="h-5 w-5 text-brand" />
            {!rail && (
              <>
                <span>{todo.length ? "Triage next" : "All caught up"}</span>
                {todo.length > 0 && <span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-[11px] text-brand-fg">{todo.length}</span>}
              </>
            )}
          </button>,
        )}
      </div>

      <div className="space-y-px">
        <P to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
        <F f="inbox" icon={Inbox} label="Inbox" n={unread("inbox")} strong />
        <F f="review" icon={MessageSquareWarning} label="Needs review" n={count("review")} />
        <F f="starred" icon={Star} label="Starred" n={count("starred")} />
        <F f="drafts" icon={FilePen} label="Drafts" n={count("drafts")} />
        <F f="sent" icon={Send} label="Sent" />
        <F f="archive" icon={Archive} label="Archive" />
        <F f="spam" icon={ShieldAlert} label="Spam" n={count("spam")} />
      </div>

      <Heading>Smart labels</Heading>
      <div className="space-y-px">
        {LABELS.filter((c) => allLabels || count(c) > 0 || folder === c).map((c) => (
          <F key={c} f={c} label={CAT[c].short === "Action" ? "Requires action" : CAT[c].short === "Delegate" ? "To delegate" : CAT[c].short} dot={CAT[c].dot} n={count(c)} />
        ))}
        {!rail && LABELS.some((c) => count(c) === 0) && (
          <button onClick={() => setAllLabels((v) => !v)} className="flex h-8 w-full items-center gap-3 rounded-full pl-4 text-xs font-medium text-muted hover:bg-fg/[0.06]">
            <ChevronDown className={cn("h-4 w-4 transition", allLabels && "rotate-180")} /> {allLabels ? "Fewer labels" : "More labels"}
          </button>
        )}
      </div>

      <Heading>Workspace</Heading>
      <div className="space-y-px">
        <P to="/tasks" icon={ListTodo} label="Tasks" n={pendingTasks} />
        <P to="/calendar" icon={CalendarDays} label="Calendar" />
        <P to="/follow-ups" icon={Clock} label="Follow-ups" n={followups} />
      </div>

      <Heading>Mailboxes</Heading>
      <div className="space-y-px">
        {view.accounts.map((a) => {
          const n = view.threads.filter((t) => t.account_id === a.id && !t.archived && t.category !== "spam").reduce((s, t) => s + t.unread, 0);
          return wrap(
            a.address,
            <Link key={a.id} to={`/inbox?account=${encodeURIComponent(a.id)}`} onClick={onNavigate} className={row(account === a.id)} aria-label={rail ? a.address : undefined}>
              <ProviderMark provider={a.provider} size="xs" />
              {!rail && (
                <>
                  <span className="min-w-0 flex-1 truncate">{a.address}</span>
                  {a.mode === "demo" && <span className="rounded bg-amber-100 px-1 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">demo</span>}
                  {n > 0 && <span className="text-xs tabular-nums text-muted">{n}</span>}
                </>
              )}
            </Link>,
          );
        })}
        {!rail && (
          <Link to="/settings" onClick={onNavigate} className="block px-4 py-1 text-xs font-medium text-brand hover:underline">
            + Connect a mailbox
          </Link>
        )}
      </div>

      <div className="mt-auto pt-3">
        <P to="/settings" icon={Settings} label="Settings" />
      </div>
    </nav>
  );
}

function SearchBox() {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const q = pathname === "/inbox" ? (params.get("q") ?? "") : "";
  const [v, setV] = useState(q);
  useEffect(() => setV(q), [q]);
  const go = (val: string) => {
    const p = new URLSearchParams(pathname === "/inbox" ? params : undefined);
    if (val) p.set("q", val);
    else p.delete("q");
    p.delete("t");
    navigate(`/inbox${p.toString() ? `?${p}` : ""}`, { replace: pathname === "/inbox" });
  };
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(v);
      }}
      className="group flex h-12 w-full max-w-2xl items-center gap-3 rounded-full bg-subtle px-4 transition focus-within:bg-surface focus-within:shadow-pop"
    >
      <Search className="h-5 w-5 text-muted" />
      <input
        id="global-search"
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          go(e.target.value);
        }}
        placeholder="Search mail across all accounts"
        aria-label="Search mail"
        className="h-full w-full bg-transparent text-[15px] outline-none placeholder:text-muted"
      />
      {v && (
        <button type="button" onClick={() => go("")} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-fg/10" aria-label="Clear search">
          <X className="h-4 w-4" />
        </button>
      )}
      <Kbd>/</Kbd>
    </form>
  );
}

function TopBar({ onPalette, onMenu, onHelp }: { onPalette: () => void; onMenu: () => void; onHelp: () => void }) {
  const { theme, setTheme, role, setRole, prefs } = useApp();
  const view = useMailboxView();
  const demo = view.accounts.some((a) => a.mode === "demo");
  const assistant = useAssistant();
  const auth = useAuth();
  const setup = useSetupGuide();
  const navigate = useNavigate();
  const icon = "grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-fg/[0.08] hover:text-fg";
  return (
    <header className="z-30 flex h-16 shrink-0 items-center gap-2 px-2 sm:gap-3 sm:px-3">
      <button onClick={onMenu} className={icon} aria-label="Main menu">
        <MenuIcon className="h-5 w-5" />
      </button>
      <Link to="/dashboard" className="flex shrink-0 items-center gap-2 pr-2 lg:w-[11.5rem]">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#0B57D0] via-[#7c4dff] to-[#e5484d] text-white shadow-sm">
          <Mail className="h-[18px] w-[18px]" />
        </span>
        <span className="hidden text-[19px] font-semibold tracking-tight text-fg sm:block">Triagedesk</span>
      </Link>
      <div className="hidden min-w-0 flex-1 md:block">
        <SearchBox />
      </div>
      <div className="ml-auto flex items-center gap-0.5">
        {demo && (
          <Tip content="Fictional demo mailboxes are shown. Sends and calendar changes in them are simulated.">
            <Link to="/settings" className="mr-1 hidden items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-200 lg:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Demo mailboxes
            </Link>
          </Tip>
        )}
        {assistant.enabled && assistant.status.available && (
          <Tip content={assistant.working ? "The assistant is reading a conversation" : `AI assistant on (${assistant.status.model})`}>
            <Link to="/settings?s=assistant" className="mr-1 hidden items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800 hover:bg-violet-200 dark:bg-violet-500/15 dark:text-violet-200 lg:inline-flex">
              {assistant.working ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI assistant
            </Link>
          </Tip>
        )}
        <NotificationBell />
        <Tip content="Command menu (Ctrl K)">
          <button onClick={onPalette} className={icon} aria-label="Open command menu">
            <CommandIcon className="h-[18px] w-[18px]" />
          </button>
        </Tip>
        <Tip content="Keyboard shortcuts (?)">
          <button onClick={onHelp} className={cn(icon, "hidden sm:grid")} aria-label="Keyboard shortcuts">
            <HelpCircle className="h-5 w-5" />
          </button>
        </Tip>
        <Tip content={theme === "dark" ? "Light theme" : "Dark theme"}>
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className={icon} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </Tip>
        <Tip content="Settings">
          <button onClick={() => navigate("/settings")} className={cn(icon, "hidden sm:grid")} aria-label="Settings">
            <Settings className="h-5 w-5" />
          </button>
        </Tip>
        <Menu>
          <MenuTrigger asChild>
            <button className="ml-1 flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-fg/[0.08]" aria-label="Account and role">
              <Avatar name={prefs.name} size="md" />
              <span className="hidden text-left leading-tight xl:block">
                <span className="block text-xs font-semibold">{prefs.name}</span>
                <span className="block text-[10px] text-muted">{ROLES[role].label}</span>
              </span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-muted xl:block" />
            </button>
          </MenuTrigger>
          <MenuContent>
            <div className="flex items-center gap-3 px-2.5 py-2">
              <Avatar name={prefs.name} size="lg" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{prefs.name}</div>
                <div className="truncate text-xs text-muted">{auth.user ? auth.user.email : auth.guest ? "Not signed in · this browser only" : ROLES[role].label}</div>
                <div className="text-xs text-muted">
                  {view.accounts.length} mailbox{view.accounts.length === 1 ? "" : "es"} · {ROLES[role].label}
                </div>
              </div>
            </div>
            <MenuSep />
            <MenuLabel>Act as</MenuLabel>
            {(Object.keys(ROLES) as Role[]).map((r) => (
              <MenuCheck key={r} checked={role === r} onSelect={() => setRole(r)}>
                <span>
                  <span className="block font-medium">{ROLES[r].label}</span>
                  <span className="block max-w-[15rem] text-xs text-muted">{ROLES[r].description}</span>
                </span>
              </MenuCheck>
            ))}
            <MenuSep />
            <MenuItem icon={<Settings />} onSelect={() => navigate("/settings")}>
              Manage mailboxes
            </MenuItem>
            {auth.user ? (
              <>
                <MenuItem icon={<Rocket />} onSelect={() => setup.show()}>
                  Setup guide
                </MenuItem>
                <MenuItem
                  icon={<LogOut />}
                  onSelect={async () => {
                    await auth.logout();
                    navigate("/login");
                  }}
                >
                  Sign out
                </MenuItem>
              </>
            ) : (
              auth.reason !== "no-server" && (
                <MenuItem icon={<LogIn />} onSelect={() => navigate("/login")}>
                  Sign in or create an account
                </MenuItem>
              )
            )}
          </MenuContent>
        </Menu>
      </div>
    </header>
  );
}

function Shell() {
  const { prefs, setPrefs } = useApp();
  const [paletteOpen, setPaletteOpen] = useCommandPalette();
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const { pathname } = useLocation();
  const fullBleed = pathname.startsWith("/inbox");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable=true]") || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "?") {
        e.preventDefault();
        setHelp(true);
      } else if (e.key === "/") {
        const s = document.getElementById("global-search");
        if (s) {
          e.preventDefault();
          s.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
      <div className="flex h-screen flex-col bg-canvas">
        <TopBar
          onPalette={() => setPaletteOpen(true)}
          onMenu={() => (window.matchMedia("(min-width: 1024px)").matches ? setPrefs({ rail: !prefs.rail }) : setMenu(true))}
          onHelp={() => setHelp(true)}
        />
        <div className="flex min-h-0 flex-1">
          <aside className={cn("hidden shrink-0 transition-[width] duration-200 lg:block", prefs.rail ? "w-[4.5rem]" : "w-64")}>
            <Sidebar rail={prefs.rail} />
          </aside>
          {menu && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <div className="absolute inset-0 bg-nav/40" onClick={() => setMenu(false)} />
              <aside className="absolute inset-y-0 left-0 w-72 animate-fade-in bg-canvas pt-3 shadow-pop">
                <button onClick={() => setMenu(false)} className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full hover:bg-subtle" aria-label="Close navigation">
                  <X className="h-4 w-4" />
                </button>
                <Sidebar rail={false} onNavigate={() => setMenu(false)} />
              </aside>
            </div>
          )}
          <main className={cn("min-w-0 flex-1 pb-2 pr-0 sm:pr-2", fullBleed ? "min-h-0" : "")}>
            <div className={cn("h-full rounded-none bg-surface sm:rounded-2xl", fullBleed ? "overflow-hidden" : "overflow-y-auto")}>
              <div className={fullBleed ? "h-full" : "mx-auto w-full max-w-7xl px-4 py-6 lg:px-8"}>
                <Routes>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/inbox" element={<InboxPage />} />
                  <Route path="/tasks" element={<TasksPage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/follow-ups" element={<FollowupsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </div>
            </div>
          </main>
        </div>
        <AssistantAgent />
        <OnboardingDialog />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <ShortcutsDialog open={help} onOpenChange={setHelp} />
      </div>
  );
}

function Splash() {
  return (
    <div className="grid h-screen place-items-center bg-canvas">
      <div className="flex flex-col items-center gap-3 text-sm text-muted">
        <span className="grid h-12 w-12 animate-pulse place-items-center rounded-2xl bg-gradient-to-br from-[#0B57D0] via-[#7c4dff] to-[#e5484d] text-white shadow-pop">
          <Mail className="h-6 w-6" />
        </span>
        Opening Triagedesk…
      </div>
    </div>
  );
}

/** The app itself needs an account, unless the person chose to continue without one (or there is no server at all). */
function RequireAccess() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === "loading") return <Splash />;
  if (!canEnter(auth)) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Shell />;
}

export default function App() {
  const auth = useAuth();
  useEffect(() => {
    auth.init();
  }, []);
  const theme = useApp((s) => s.theme);
  const home = auth.status === "loading" ? <Splash /> : auth.status === "signed_in" ? <Navigate to="/dashboard" replace /> : <LandingPage />;
  return (
    <TipProvider>
      <Routes>
        <Route path="/" element={home} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/forgot" element={<AuthPage mode="forgot" />} />
        <Route path="/reset" element={<AuthPage mode="reset" />} />
        <Route path="/*" element={<RequireAccess />} />
      </Routes>
      <Toaster position="bottom-left" theme={theme} richColors closeButton />
    </TipProvider>
  );
}
