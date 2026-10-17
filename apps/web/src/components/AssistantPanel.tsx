import { useEffect, useState } from "react";
import type { Decision, ThreadFacts } from "@c16/core";
import { Icon } from "./Icons";
import { answer, QUESTIONS, type Answer, type QuestionId } from "../lib/assistant";

/** Ask-about-this-thread panel. Answers come from extracted facts only, with the emails they rely on. */
export function AssistantPanel({ t, ds, onCite }: { t: ThreadFacts; ds: Decision[]; onCite: (emailId: string) => void }) {
  const [chat, setChat] = useState<{ q: QuestionId; a: Answer }[]>([]);
  useEffect(() => setChat([]), [t.thread_key]);
  const ask = (q: QuestionId) => setChat((c) => [...c.filter((x) => x.q !== q), { q, a: answer(q, t, ds) }]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon name="chat" className="h-4 w-4 text-indigo-500" />
        <h3 className="text-sm font-semibold">Ask about this thread</h3>
        <span className="text-[11px] text-slate-500">answers cite the emails they come from</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUESTIONS.map((q) => (
          <button key={q.id} onClick={() => ask(q.id)} className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100">
            {q.label}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-3" aria-live="polite">
        {chat.map(({ q, a }) => (
          <div key={q} className="space-y-1.5">
            <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-slate-900 px-3 py-1.5 text-xs text-white">{QUESTIONS.find((x) => x.id === q)!.label}</div>
            <div className="max-w-[95%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-800">
              <ul className="space-y-1">
                {a.lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
              {a.cites.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {a.cites.map((id) => (
                    <button key={id} onClick={() => onCite(id)} className="rounded bg-white px-1.5 font-mono text-[11px] text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50">
                      {id}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
