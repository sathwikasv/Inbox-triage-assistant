import { useEffect, useState } from "react";
import { ArrowUp, Bot, CircleAlert, Lightbulb, Quote, Sparkles } from "lucide-react";
import { formatDate, type Decision, type Fact, type ThreadFacts } from "@c16/core";
import { answer, QUESTIONS, routeQuestion, type Answer } from "../../lib/assistant";
import { ACTION_META, Badge, PURPOSE_LABEL, cn } from "../../ui";

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h4 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
        {title}
      </h4>
      {children}
    </section>
  );
}

export function CopilotPanel({ t, ds, onCite }: { t: ThreadFacts; ds: Decision[]; onCite: (e: Fact["evidence"]) => void }) {
  const [chat, setChat] = useState<{ q: string; a: Answer }[]>([]);
  const [text, setText] = useState("");
  useEffect(() => setChat([]), [t.thread_key]);
  const ask = (q: string) => {
    if (!q.trim()) return;
    setChat((c) => [...c, { q, a: answer(routeQuestion(q), t, ds) }]);
    setText("");
  };
  const summary = answer("summary", t, ds);
  const risks = answer("risks", t, ds);
  const facts = ds.flatMap((d) => d.facts).filter((f) => f.kind !== "injection");
  const meta = ACTION_META[t.next_action.kind];
  const Cite = ({ e }: { e: Fact["evidence"] }) => (
    <button onClick={() => onCite(e)} title={`"${e.quote}"`} className="rounded bg-brand/10 px-1 font-mono text-[11px] text-brand hover:bg-brand/20">
      {e.email_id}
    </button>
  );

  return (
    <div className="space-y-3 p-4 lg:p-5">
      <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 p-4 text-white shadow-card">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/80">
          <Sparkles className="h-3.5 w-3.5" /> Copilot summary
        </div>
        <p className="mt-2 text-[15px] leading-6">{summary.lines.join(" ")}</p>
        <p className="mt-2 text-[11px] text-white/70">Built from extracted facts only; nothing is invented. Click a citation to see its source.</p>
      </div>

      <Section icon={<Lightbulb />} title="Next best action">
        <div className="flex items-start gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <div className="text-sm">
            <div className="font-medium">{t.next_action.label}</div>
            <div className="text-muted">{t.next_action.reason}.</div>
          </div>
        </div>
        {t.escalations.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {t.escalations.map((e) => (
              <li key={e.code} className="flex items-start gap-2 text-sm">
                <CircleAlert className={cn("mt-0.5 h-4 w-4 shrink-0", e.severity === "high" ? "text-rose-500" : "text-amber-500")} />
                {e.reason}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {facts.length > 0 && (
        <Section icon={<Quote />} title="Key facts">
          <ul className="divide-y divide-line">
            {facts.map((f, i) => (
              <li key={i} className="flex items-center gap-3 py-1.5 text-sm">
                <span className="w-24 shrink-0 text-xs capitalize text-muted">{f.kind.replace("_", " ")}</span>
                <span className={cn("flex-1", f.superseded_by && "text-muted line-through")}>{f.kind === "due" ? formatDate(f.value) : f.value}</span>
                <Cite e={f.evidence} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section icon={<CircleAlert />} title="Risks">
        <ul className="space-y-1 text-sm">
          {risks.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </Section>

      <Section icon={<Bot />} title="Type check: rules vs AI">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="pb-1.5 font-semibold">Email</th>
              <th className="pb-1.5 font-semibold">Rules</th>
              <th className="pb-1.5 font-semibold">AI</th>
              <th className="pb-1.5 font-semibold">Final</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ds.map((d) => (
              <tr key={d.email_id}>
                <td className="py-1.5 font-mono text-xs">{d.email_id}</td>
                <td className="py-1.5 text-xs">{d.ai ? (d.ai.rule_purpose ? PURPOSE_LABEL[d.ai.rule_purpose] : "no match") : PURPOSE_LABEL[d.purpose]}</td>
                <td className="py-1.5 text-xs">{d.ai ? `${PURPOSE_LABEL[d.ai.purpose]} · ${Math.round(d.ai.confidence * 100)}%` : <span className="text-muted">off</span>}</td>
                <td className="py-1.5">
                  <Badge tone={d.review?.needed ? "amber" : "green"}>{PURPOSE_LABEL[d.purpose]}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section icon={<Sparkles />} title="Ask Copilot">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {QUESTIONS.map((q) => (
            <button key={q.id} onClick={() => ask(q.label)} className="rounded-full border border-line bg-subtle px-2.5 py-1 text-xs font-medium hover:border-brand/40 hover:text-brand">
              {q.label}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {chat.map((c, i) => (
            <div key={i} className="space-y-1.5 animate-fade-in">
              <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3 py-1.5 text-sm text-brand-fg">{c.q}</div>
              <div className="max-w-[95%] rounded-2xl rounded-bl-md bg-subtle px-3 py-2 text-sm">
                {c.a.lines.map((l, j) => (
                  <p key={j}>{l}</p>
                ))}
                {c.a.cites.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {c.a.cites.map((id) => (
                      <Cite key={id} e={{ email_id: id, quote: "" }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(text);
          }}
          className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-canvas/50 p-1.5 pl-3 focus-within:border-brand/50"
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about deadlines, owners, risks…" aria-label="Ask Copilot" className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
          <button disabled={!text.trim()} className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-brand-fg disabled:opacity-40" aria-label="Ask">
            <ArrowUp className="h-4 w-4" />
          </button>
        </form>
      </Section>
    </div>
  );
}
