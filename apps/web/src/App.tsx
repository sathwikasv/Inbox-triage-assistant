import { useEffect } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import ImportPage from "./pages/ImportPage";
import WorkspacePage from "./pages/WorkspacePage";
import PlaygroundPage from "./pages/PlaygroundPage";
import ReviewPage from "./pages/ReviewPage";
import JudgePage from "./pages/JudgePage";
import { PolicyBadge } from "./components/Banners";
import { Toaster } from "./components/Toaster";
import { Icon } from "./components/Icons";
import { useTriage } from "./store/triage";

const nav = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-2.5 py-1.5 text-sm font-medium ${isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`;

function ThreadRedirect() {
  const { key = "" } = useParams();
  const { hash } = useLocation();
  return <Navigate to={`/inbox/${encodeURIComponent(key)}${hash}`} replace />;
}

export default function App() {
  const { boot, booted, run, repo, apiStatus, notice, switchRepo, ai } = useTriage();
  const { pathname } = useLocation();
  const workspace = pathname.startsWith("/inbox");
  useEffect(() => {
    boot();
  }, [boot]);

  return (
    <div className={`flex flex-col bg-slate-50 text-slate-900 ${workspace ? "h-screen" : "min-h-screen"}`}>
      <header className="z-20 shrink-0 border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-900 text-white">
              <Icon name="inbox" className="h-4 w-4" />
            </span>
            Inbox Triage <span className="font-normal text-slate-500">· C16</span>
          </span>
          <nav className="flex flex-wrap gap-1">
            <NavLink to="/" end className={nav}>
              Import
            </NavLink>
            <NavLink to="/inbox" className={nav}>
              Inbox
            </NavLink>
            <NavLink to="/try" className={nav}>
              Test an email
            </NavLink>
            <NavLink to="/review" className={nav}>
              Review
            </NavLink>
            <NavLink to="/judge" className={nav}>
              Judge view
            </NavLink>
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span
              title={ai.enabled ? `Email types are double-checked by ${ai.model}; facts always come from the rules` : "Rules only. Set GEMINI_API_KEY on the API to add the AI type check"}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium ring-1 ring-inset ${ai.enabled ? "bg-violet-50 text-violet-700 ring-violet-200" : "bg-slate-100 text-slate-600 ring-slate-200"}`}
            >
              <Icon name="sparkle" className="h-3.5 w-3.5" /> {ai.enabled ? `AI check: ${ai.model}` : "AI check off"}
            </span>
            <label className="flex items-center gap-1">
              <span className="sr-only">Storage</span>
              <select
                value={repo.kind}
                onChange={(e) => switchRepo(e.target.value as "api" | "local")}
                className="rounded border border-slate-300 bg-white py-0.5 pl-1 pr-6 text-xs text-slate-700"
                title="Where reviewed results are saved"
              >
                <option value="api">Saved to API (MongoDB)</option>
                <option value="local">Saved in this browser</option>
              </select>
            </label>
            <PolicyBadge policy={run?.result.policy} />
          </div>
        </div>
      </header>
      {notice && <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">{notice}</div>}
      <main className={workspace ? "min-h-0 flex-1" : "mx-auto w-full max-w-6xl px-4 py-6"}>
        {!booted ? (
          <div className="p-6 text-sm text-slate-500">{apiStatus === "waking" ? "Waking the API. The free hosting tier can take up to a minute…" : "Loading…"}</div>
        ) : (
          <Routes>
            <Route path="/" element={<ImportPage />} />
            <Route path="/inbox" element={<WorkspacePage />} />
            <Route path="/inbox/:key" element={<WorkspacePage />} />
            <Route path="/try" element={<PlaygroundPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/judge" element={<JudgePage />} />
            <Route path="/triage" element={<Navigate to="/inbox" replace />} />
            <Route path="/thread/:key" element={<ThreadRedirect />} />
          </Routes>
        )}
      </main>
      <Toaster />
    </div>
  );
}
