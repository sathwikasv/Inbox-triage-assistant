import { Link } from "react-router-dom";
import { POLICY, type Decision, type Policy } from "@c16/core";

export function PolicyBadge({ policy = POLICY }: { policy?: Policy }) {
  const ok = policy.draft_only === true && policy.auto_send === false;
  return (
    <span
      title="Permission policy. It is frozen in code; no email, import or edit can change it."
      className={`rounded-md px-2 py-1 font-mono text-[11px] ring-1 ring-inset ${ok ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-red-600 text-white ring-red-600"}`}
    >
      draft_only: {String(policy.draft_only)} · auto_send: {String(policy.auto_send)}
    </span>
  );
}

export function QuarantineBanner({ quarantined, policy }: { quarantined: Decision[]; policy: Policy }) {
  if (!quarantined.length) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <div className="font-semibold">
        {quarantined.length} email{quarantined.length > 1 ? "s" : ""} quarantined: instruction-like content
      </div>
      <ul className="mt-1 list-disc pl-5">
        {quarantined.map((d) => (
          <li key={d.email_id}>
            <Link className="font-medium underline" to={`/inbox/${encodeURIComponent(d.thread_key)}#${d.email_id}`}>
              {d.email_id}
            </Link>{" "}
            {d.explain.purpose}. No task, draft or archive was created.
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        Policy after processing: <PolicyBadge policy={policy} /> <span>· 0 actions executed</span>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">{children}</div>;
}
