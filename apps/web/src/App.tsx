import { useEffect } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams, Link } from "react-router-dom";
import { Toaster } from "sonner";
import { BarChart3, ChevronDown, ClipboardCheck, Database, FlaskConical, Gavel, Inbox, LogOut, Moon, Search, Settings, ShieldCheck, Sparkles, Sun, Upload } from "lucide-react";
import ImportPage from "./pages/ImportPage";
import WorkspacePage from "./pages/WorkspacePage";
import PlaygroundPage from "./pages/PlaygroundPage";
import ReviewPage from "./pages/ReviewPage";
import JudgePage from "./pages/JudgePage";
import InsightsPage from "./pages/InsightsPage";
import SettingsPage from "./pages/SettingsPage";
import { CommandPalette, useCommandPalette } from "./components/CommandPalette";
import { useTriage } from "./store/triage";
import { ROLES } from "./lib/permissions";
import { Avatar, Kbd, Menu, MenuCheck, MenuContent, MenuItem, MenuLabel, MenuSep, MenuTrigger, Tip, TipProvider, cn } from "./ui";
import type { Role } from "./repo";

const NAV = [
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/insights", label: "Insights", icon: BarChart3 },
  { to: "/playground", label: "Test an email", icon: FlaskConical },
  { to: "/review", label: "Review", icon: ClipboardCheck },
  { to: "/judge", label: "Judge view", icon: Gavel },
];

function ThreadRedirect() {
  const { key = "" } = useParams();
  const { hash } = useLocation();
  return <Navigate to={`/inbox/${encodeURIComponent(key)}${hash}`} replace />;
}

function TopBar({ onSearch }: { onSearch: () => void }) {
  const { run, repo, switchRepo, ai, role, setRole, theme, setTheme } = useTriage();
  const navigate = useNavigate();
  const policy = run?.result.policy ?? { draft_only: true, auto_send: false };
  const tab = ({ isActive }: { isActive: boolean }) =>
    cn("inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors", isActive ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white");
  return (
    <header className="z-30 shrink-0 bg-nav text-white">
      <div className="flex h-14 items-center gap-3 px-4">
        <Link to="/inbox" className="mr-2 flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-400 to-violet-600 shadow-inner">
            <Inbox className="h-4 w-4" />
          </span>
          <span className="hidden text-[15px] font-semibold tracking-tight sm:block">
            Triage<span className="text-indigo-300">desk</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-0.5 lg:flex">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={tab}>
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onSearch} className="hidden h-9 w-64 items-center gap-2 rounded-lg bg-white/[0.07] px-3 text-sm text-white/60 ring-1 ring-inset ring-white/10 hover:bg-white/10 md:flex">
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search or jump to…</span>
            <span className="rounded border border-white/15 px-1.5 font-mono text-[10px]">Ctrl K</span>
          </button>
          <Tip content={ai.enabled ? `Email types are double-checked by ${ai.model}. Facts always come from the rules.` : "AI type check is off: rules only. Add GEMINI_API_KEY to the API to enable it."}>
            <span className={cn("hidden h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium ring-1 ring-inset sm:inline-flex", ai.enabled ? "bg-violet-500/15 text-violet-200 ring-violet-400/30" : "bg-white/5 text-white/60 ring-white/10")}>
              <Sparkles className="h-3.5 w-3.5" /> {ai.enabled ? "AI on" : "AI off"}
            </span>
          </Tip>
          <Tip content={`Policy: draft_only = ${policy.draft_only}, auto_send = ${policy.auto_send}. Frozen in code; emails cannot change it.`}>
            <Link to="/settings" className="hidden h-8 items-center gap-1.5 rounded-lg bg-emerald-500/15 px-2.5 text-xs font-medium text-emerald-200 ring-1 ring-inset ring-emerald-400/30 sm:inline-flex">
              <ShieldCheck className="h-3.5 w-3.5" /> Draft-only
            </Link>
          </Tip>
          <Tip content={theme === "dark" ? "Light mode" : "Dark mode"}>
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white" aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </Tip>
          <Menu>
            <MenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-white/10" aria-label="Account and role">
                <Avatar name={ROLES[role].label} size="sm" />
                <span className="hidden text-left leading-tight sm:block">
                  <span className="block text-xs font-medium">Ops team</span>
                  <span className="block text-[11px] text-white/55">{ROLES[role].label}</span>
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
              <MenuSep />
              <MenuLabel>Storage</MenuLabel>
              <MenuCheck checked={repo.kind === "api"} onSelect={() => switchRepo("api")}>
                API · MongoDB
              </MenuCheck>
              <MenuCheck checked={repo.kind === "local"} onSelect={() => switchRepo("local")}>
                This browser (fallback)
              </MenuCheck>
              <MenuSep />
              <MenuItem icon={<Settings />} onSelect={() => navigate("/settings")}>
                Settings and permissions
              </MenuItem>
              <MenuItem icon={<Upload />} onSelect={() => navigate("/")}>
                Data sources
              </MenuItem>
              <MenuItem icon={<LogOut />} disabled hint="demo">
                Sign out
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} className={tab}>
            <n.icon className="h-4 w-4" />
            {n.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}

export default function App() {
  const { boot, booted, apiStatus, notice, theme } = useTriage();
  const { pathname } = useLocation();
  const [paletteOpen, setPaletteOpen] = useCommandPalette();
  const fullBleed = pathname.startsWith("/inbox");
  useEffect(() => {
    boot();
  }, [boot]);

  return (
    <TipProvider>
      <div className={cn("flex flex-col bg-canvas", fullBleed ? "h-screen" : "min-h-screen")}>
        <TopBar onSearch={() => setPaletteOpen(true)} />
        {notice && (
          <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-200">
            <Database className="h-4 w-4" /> {notice}
          </div>
        )}
        <main className={fullBleed ? "min-h-0 flex-1" : "mx-auto w-full max-w-7xl px-4 py-6 lg:px-8"}>
          {!booted ? (
            <div className="grid h-64 place-items-center text-sm text-muted">{apiStatus === "waking" ? "Waking the API. The free hosting tier can take up to a minute…" : "Loading…"}</div>
          ) : (
            <Routes>
              <Route path="/" element={<ImportPage />} />
              <Route path="/inbox" element={<WorkspacePage />} />
              <Route path="/inbox/:key" element={<WorkspacePage />} />
              <Route path="/insights" element={<InsightsPage />} />
              <Route path="/playground" element={<PlaygroundPage />} />
              <Route path="/review" element={<ReviewPage />} />
              <Route path="/judge" element={<JudgePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/try" element={<Navigate to="/playground" replace />} />
              <Route path="/triage" element={<Navigate to="/inbox" replace />} />
              <Route path="/thread/:key" element={<ThreadRedirect />} />
            </Routes>
          )}
        </main>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <Toaster position="bottom-right" theme={theme} richColors closeButton />
        <span className="sr-only">
          Press <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> to search
        </span>
      </div>
    </TipProvider>
  );
}
