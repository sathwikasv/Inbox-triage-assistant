import { useTriage } from "../store/triage";

const TONE = { ok: "bg-slate-900 text-white", info: "bg-indigo-600 text-white", warn: "bg-amber-500 text-slate-950" } as const;

export function Toaster() {
  const toasts = useTriage((s) => s.toasts);
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`pointer-events-auto rounded-lg px-4 py-2.5 text-sm shadow-lg ${TONE[t.tone]}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
