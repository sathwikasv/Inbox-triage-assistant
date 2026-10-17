import { useEffect } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import ImportPage from "./pages/ImportPage";
import TriagePage from "./pages/TriagePage";
import ThreadPage from "./pages/ThreadPage";
import { PolicyBadge } from "./components/Banners";
import { useTriage } from "./store/triage";

const nav = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-2.5 py-1.5 text-sm font-medium ${isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`;

export default function App() {
  const { boot, booted, run, repo } = useTriage();
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
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{repo.kind === "api" ? "Saved to API" : "Saved in this browser"}</span>
            <PolicyBadge policy={run?.result.policy} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {!booted ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : (
          <Routes>
            <Route path="/" element={<ImportPage />} />
            <Route path="/triage" element={<TriagePage />} />
            <Route path="/thread/:key" element={<ThreadPage />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
