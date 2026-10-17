import { Bot, Check, Database, Lock, Mail, Minus, ShieldCheck, Siren, Users } from "lucide-react";
import { POLICY } from "@c16/core";
import { useTriage } from "../store/triage";
import { PERMISSIONS, ROLES } from "../lib/permissions";
import { Badge, Button, cn } from "../ui";
import type { Role } from "../repo";

const RULES = [
  { code: "no_owner", severity: "high", rule: "A request has no confirmed owner", action: "Escalate: assign an owner" },
  { code: "suspicious", severity: "high", rule: "Instruction-like content (policy override, data exfiltration, permission change, role hijack)", action: "Quarantine and escalate to security; never answered or archived" },
  { code: "blocked", severity: "high", rule: "Work is blocked and not yet resolved", action: "Escalate: unblock" },
  { code: "overdue", severity: "high", rule: "The current deadline has passed", action: "Escalation flag on the thread" },
  { code: "due_soon", severity: "medium", rule: "The current deadline is within one day", action: "Escalation flag on the thread" },
  { code: "repeated_chaser", severity: "medium", rule: "Two or more repeat requests in one thread", action: "Escalation flag: the sender is waiting" },
];

function Card({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-soft text-brand [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-sm text-muted">{description}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const { role, setRole, repo, switchRepo, ai, run } = useTriage();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">Policy, roles and the rules the triage engine applies. Changes to the policy are not possible from the app or from email content.</p>
      </div>

      <Card icon={<ShieldCheck />} title="Sending policy" description="Frozen in code (Object.freeze) and re-checked after every run.">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { k: "draft_only", v: String(POLICY.draft_only), d: "Replies are drafts for a person" },
            { k: "auto_send", v: String(POLICY.auto_send), d: "Nothing is ever sent automatically" },
            { k: "injection guard", v: "on", d: "Instruction-like emails are quarantined" },
          ].map((x) => (
            <div key={x.k} className="rounded-xl border border-line bg-subtle p-4">
              <div className="flex items-center gap-2 font-mono text-xs text-muted">
                <Lock className="h-3.5 w-3.5" /> {x.k}
              </div>
              <div className="mt-1 text-lg font-semibold">{x.v}</div>
              <div className="text-xs text-muted">{x.d}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">Run policy after processing: {run ? `draft_only = ${run.result.policy.draft_only}, auto_send = ${run.result.policy.auto_send}` : "no run loaded"}.</p>
      </Card>

      <Card icon={<Users />} title="Roles and permissions" description="Escalation and permission controls come before any send feature (the change negotiated for this product).">
        <div className="mb-4 flex flex-wrap gap-2">
          {(Object.keys(ROLES) as Role[]).map((r) => (
            <button key={r} onClick={() => setRole(r)} className={cn("rounded-xl border px-3 py-2 text-left text-sm transition", role === r ? "border-brand bg-brand-soft ring-2 ring-brand/20" : "border-line hover:bg-subtle")}>
              <div className="flex items-center gap-2 font-medium">
                {ROLES[r].label} {role === r && <Badge tone="brand">you</Badge>}
              </div>
              <div className="max-w-[16rem] text-xs text-muted">{ROLES[r].description}</div>
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="pb-2 font-semibold">Permission</th>
                {(Object.keys(ROLES) as Role[]).map((r) => (
                  <th key={r} className={cn("pb-2 text-center font-semibold", role === r && "text-brand")}>
                    {ROLES[r].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {PERMISSIONS.map((p) => (
                <tr key={p.id}>
                  <td className="py-2.5">
                    {p.label}
                    {p.note && <div className="text-xs text-muted">{p.note}</div>}
                  </td>
                  {(Object.keys(ROLES) as Role[]).map((r) => (
                    <td key={r} className={cn("py-2.5 text-center", role === r && "bg-brand-soft/40")}>
                      {p.roles.includes(r) ? <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="allowed" /> : <Minus className="mx-auto h-4 w-4 text-muted/60" aria-label="not allowed" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card icon={<Siren />} title="Escalation rules" description="Applied by the engine to every thread; ages are measured against the newest email in the import.">
        <ul className="divide-y divide-line">
          {RULES.map((r) => (
            <li key={r.code} className="flex flex-wrap items-start gap-3 py-3 text-sm">
              <Badge tone={r.severity === "high" ? "red" : "amber"}>{r.severity}</Badge>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{r.rule}</div>
                <div className="text-muted">{r.action}</div>
              </div>
              <span className="font-mono text-xs text-muted">{r.code}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card icon={<Database />} title="Integrations" description="Where data comes from and where reviewed results are saved.">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-line p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Bot className="h-4 w-4 text-violet-500" /> AI type check
            </div>
            <div className="mt-1">
              <Badge tone={ai.enabled ? "green" : "neutral"}>{ai.enabled ? `on · ${ai.model}` : "off"}</Badge>
            </div>
            <p className="mt-2 text-xs text-muted">Gemini double-checks email types; rules extract every fact. Enable with GEMINI_API_KEY on the API. Synthetic data only.</p>
          </div>
          <div className="rounded-xl border border-line p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Database className="h-4 w-4 text-sky-500" /> Storage
            </div>
            <div className="mt-1 flex gap-1.5">
              <Button size="xs" variant={repo.kind === "api" ? "primary" : "secondary"} onClick={() => switchRepo("api")}>
                API · MongoDB
              </Button>
              <Button size="xs" variant={repo.kind === "local" ? "primary" : "secondary"} onClick={() => switchRepo("local")}>
                This browser
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">If the API is unreachable the app falls back to this browser and says so.</p>
          </div>
          <div className="rounded-xl border border-line p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Mail className="h-4 w-4 text-rose-500" /> Gmail mailbox
            </div>
            <div className="mt-1">
              <Badge tone="amber">planned</Badge>
            </div>
            <p className="mt-2 text-xs text-muted">Connect a spare mailbox: sync, apply labels after approval, save replies as Gmail drafts. Never send.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
