import { useEffect } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import ImportPage from "./pages/ImportPage";
import TriagePage from "./pages/TriagePage";
import ThreadPage from "./pages/ThreadPage";
import ReviewPage from "./pages/ReviewPage";
import JudgePage from "./pages/JudgePage";
import { PolicyBadge } from "./components/Banners";
import { useTriage } from "./store/triage";

const nav = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-2.5 py-1.5 text-sm font-medium ${isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`;

export default function App() {
  const { boot, booted, run, repo, apiStatus, notice, switchRepo } = useTriage();
  useEffect(() => {
    boot();
  }, [boot]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <span className="font-semibold tracking-tight">
            Inbox Triage <span className="font-normal text-slate-500">· C16</span>
          </span>
          <nav className="flex flex-wrap gap-1">
            <NavLink to="/" end className={nav}>
              Import
            </NavLink>
            <NavLink to="/triage" className={nav}>
              Triage
            </NavLink>
            <NavLink to="/review" className={nav}>
              Review
            </NavLink>
            <NavLink to="/judge" className={nav}>
              Judge view
            </NavLink>
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-slate-500">
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
      <main className="mx-auto max-w-6xl px-4 py-6">
        {notice && <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{notice}</div>}
        {!booted ? (
          <div className="text-sm text-slate-500">{apiStatus === "waking" ? "Waking the API. The free hosting tier can take up to a minute…" : "Loading…"}</div>
        ) : (
          <Routes>
            <Route path="/" element={<ImportPage />} />
            <Route path="/triage" element={<TriagePage />} />
            <Route path="/thread/:key" element={<ThreadPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/judge" element={<JudgePage />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
