import { Routes, Route, Link } from "react-router-dom";
import ImportPage from "./pages/ImportPage";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b bg-white px-6 py-3 flex gap-6 items-center">
        <span className="font-semibold">C16 · Inbox Triage</span>
        <nav className="flex gap-4 text-sm">
          <Link to="/">Import</Link>
          <Link to="/triage">Triage</Link>
          <Link to="/review">Review</Link>
          <Link to="/judge">Judge view</Link>
        </nav>
        <span className="ml-auto text-xs rounded bg-amber-100 px-2 py-1">draft-only · auto_send: false</span>
      </header>
      <main className="p-6">
        <Routes>
          <Route path="/" element={<ImportPage />} />
          {/* TODO(B): /triage, /thread/:key, /review, /judge */}
        </Routes>
      </main>
    </div>
  );
}
