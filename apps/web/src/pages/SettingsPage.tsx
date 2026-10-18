import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Ban, CalendarDays, Check, Download, KeyRound, Loader2, Lock, Minus, RefreshCw, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, UploadCloud, Users } from "lucide-react";
import { useAssistant } from "../store/assistant";
import { useReviewItems } from "../lib/review";
import { useAuth } from "../store/auth";
import { forgetMemory, listMemory, type StoredMemory } from "../lib/ai";
import { fixtureToCsv, type Role } from "@c16/core";
import { useApp } from "../store/app";
import { useMailbox, useMailboxView } from "../store/mailbox";
import { CALENDAR_PROVIDERS, MAIL_PROVIDERS, saveSetting, setting } from "../lib/providers";
import { DEMO_MAILBOX } from "../lib/demoMailbox";
import { PERMISSIONS, ROLES } from "../lib/permissions";
import { CompanyBadge, ProviderMark, accountNote, localTime } from "../components/mail/common";
import { ConnectTiles } from "../components/Onboarding";
import type { MailAccount } from "@c16/core";
import { Badge, Button, Segmented, Tip, cn } from "../ui";

type Section = "accounts" | "assistant" | "integrations" | "preferences" | "safety" | "import";
const ZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney", "UTC"];

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const SECTIONS: { value: Section; label: string; hint: string; icon: typeof Users }[] = [
  { value: "accounts", label: "Accounts", hint: "Mailboxes and calendars", icon: Users },
  { value: "assistant", label: "AI assistant", hint: "Drafts, review flags, alerts", icon: Sparkles },
  { value: "integrations", label: "Integrations", hint: "Provider app IDs, server", icon: KeyRound },
  { value: "preferences", label: "Preferences", hint: "Name, timezone, theme", icon: SlidersHorizontal },
  { value: "safety", label: "Safety and permissions", hint: "Roles, rules, activity", icon: ShieldCheck },
  { value: "import", label: "Import", hint: "CSV or JSON files", icon: UploadCloud },
];

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const section = (params.get("s") ?? "accounts") as Section;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">Mailboxes, permissions and preferences for this workspace.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto lg:flex-col">
          {SECTIONS.map((x) => (
            <button
              key={x.value}
              onClick={() => setParams({ s: x.value })}
              className={cn("flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition", section === x.value ? "bg-brand-soft font-semibold text-fg" : "text-fg/80 hover:bg-subtle")}
            >
              <x.icon className="h-4 w-4 shrink-0" />
              <span>
                <span className="block">{x.label}</span>
                <span className="hidden text-[11px] font-normal text-muted lg:block">{x.hint}</span>
              </span>
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {section === "accounts" && <Accounts />}
          {section === "assistant" && <AssistantSection />}
          {section === "integrations" && <Integrations />}
          {section === "preferences" && <Preferences />}
          {section === "safety" && <Safety />}
          {section === "import" && <ImportSection />}
        </div>
      </div>
    </div>
  );
}

function CompanyEditor({ account }: { account: MailAccount }) {
  const setCompany = useMailbox((m) => m.setAccountCompany);
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(account.company ?? "");
  if (!editing)
    return (
      <span className="inline-flex items-center gap-1.5">
        {account.company ? <CompanyBadge account={account} /> : <span className="text-xs text-muted">no company</span>}
        <button onClick={() => (setV(account.company ?? ""), setEditing(true))} aria-label={`Edit company for ${account.address}`} className="text-xs font-medium text-brand hover:underline">
          {account.company ? "Edit" : "Add company"}
        </button>
      </span>
    );
  const save = () => {
    setCompany(account.id, v);
    setEditing(false);
  };
  return (
    <form
      className="inline-flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} maxLength={80} aria-label={`Company for ${account.address}`} placeholder="Company or label" className="h-7 w-40 rounded-lg border border-line bg-surface px-2 text-xs outline-none focus:border-brand/60" />
      <Button size="xs" variant="primary" type="submit">
        Save
      </Button>
      <Button size="xs" variant="ghost" type="button" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </form>
  );
}

function Accounts() {
  const view = useMailboxView();
  const { refresh, disconnect, enableSend, removeImport, connectCalendar, calendars, busy } = useMailbox();
  const { prefs, setPrefs } = useApp();
  const groups = new Map<string, MailAccount[]>();
  for (const a of view.accounts) groups.set(a.company ?? "No company", [...(groups.get(a.company ?? "No company") ?? []), a]);
  return (
    <div className="space-y-4">
      <Card title="Mailboxes" description="Connect as many Gmail and Yahoo accounts as you need, from different companies. Each signs in on its provider's own consent screen. Your passwords are never entered here.">
        <div className="space-y-5">
          {[...groups.entries()].map(([company, accounts]) => (
            <section key={company} aria-label={company}>
              <div className="label-xs mb-1">
                {company} <span className="font-normal normal-case text-muted">· {accounts.length} mailbox{accounts.length === 1 ? "" : "es"}</span>
              </div>
              <ul className="divide-y divide-line rounded-xl border border-line px-3">
                {accounts.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                    <ProviderMark provider={a.provider} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{a.address}</div>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span>
                          {accountNote(a)}
                          {a.mode === "connected" && a.last_sync_at ? ` · synced ${localTime(a.last_sync_at, prefs.timezone)}` : ""}
                        </span>
                        {a.mode !== "demo" && <CompanyEditor account={a} />}
                      </div>
                    </div>
                    {a.mode === "demo" && <Badge tone="amber">demo data</Badge>}
                    {a.mode === "connected" && (
                      <>
                        {a.send_enabled ? (
                          <Badge tone="green">can send after your approval</Badge>
                        ) : (
                          <Button size="xs" disabled={busy[`send-permission:${a.id}`]} onClick={() => enableSend(a.id)}>
                            <Lock className="h-3.5 w-3.5" /> Allow sending
                          </Button>
                        )}
                        <Button size="xs" disabled={busy[`refresh:${a.id}`]} onClick={() => refresh(a.id)}>
                          <RefreshCw className={cn("h-3.5 w-3.5", busy[`refresh:${a.id}`] && "animate-spin")} /> Sync
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => disconnect(a.id)}>
                          Disconnect
                        </Button>
                      </>
                    )}
                    {a.mode === "import" && (
                      <Button size="xs" variant="ghost" onClick={() => removeImport(a.id)}>
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="mt-5 border-t border-line pt-4">
          <ConnectTiles withCompany />
        </div>
        {(["gmail", "yahoo"] as const).some((p) => MAIL_PROVIDERS[p]!.setupNeeded()) && (
          <p className="mt-2 text-xs text-muted">
            Greyed out? Add the provider's app ID under{" "}
            <a href="/settings?s=integrations" className="text-brand hover:underline">
              Integrations
            </a>
            .
          </p>
        )}
        <label className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-sm">
          <input type="checkbox" checked={prefs.showDemo} onChange={(e) => setPrefs({ showDemo: e.target.checked })} />
          Show the demo accounts ({DEMO_MAILBOX.accounts.map((a) => a.address).join(", ")}). Their emails are fictional and their actions are simulated.
        </label>
      </Card>

      <Card title="Calendar" description="Connected separately from mail. Connecting a mailbox never grants calendar access.">
        <div className="grid gap-2 sm:grid-cols-2">
          {(["google"] as const).map((c) => {
            const client = CALENDAR_PROVIDERS[c];
            const link = calendars.find((x) => x.calendar === c);
            const need = client.setupNeeded();
            return link ? (
              <div key={c} className="flex items-center gap-2 rounded-xl border border-line p-3 text-sm">
                <CalendarDays className="h-4 w-4 text-emerald-600" /> {client.label}: {link.address} <Badge tone="green">{link.events.length} events</Badge>
              </div>
            ) : (
              <Tip key={c} content={need ?? `Allow ${client.label} access to check conflicts and add events you accept`}>
                <span>
                  <Button size="md" className="w-full justify-center" disabled={!!need || busy[`calendar:${c}`]} onClick={() => connectCalendar(c)}>
                    {busy[`calendar:${c}`] ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />} Connect {client.label}
                  </Button>
                </span>
              </Tip>
            );
          })}
        </div>
        {calendars.length === 0 && <p className="mt-2 text-xs text-muted">Until a calendar is connected, accepted events go to a demo calendar in this browser.</p>}
      </Card>
    </div>
  );
}

function Field({ label, value, onSave, placeholder, valid }: { label: string; value: string; onSave: (v: string) => void; placeholder: string; valid: (v: string) => boolean }) {
  const [v, setV] = useState(value);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="w-40 text-sm font-medium" htmlFor={label}>
        {label}
      </label>
      <input id={label} value={v} onChange={(e) => setV(e.target.value.trim())} placeholder={placeholder} className="min-w-[16rem] flex-1 rounded-lg border border-line bg-canvas/40 px-2.5 py-1.5 font-mono text-xs outline-none focus:border-brand/50" />
      <Button size="sm" variant="primary" disabled={v === value || (v !== "" && !valid(v))} onClick={() => onSave(v)}>
        Save
      </Button>
      {value && <Check className="h-4 w-4 text-emerald-600" aria-label="saved" />}
    </div>
  );
}

function Integrations() {
  const toast = useApp((s) => s.toast);
  const [, force] = useState(0);
  const save = (k: "google" | "api", v: string) => {
    saveSetting(k, v);
    force((n) => n + 1);
    toast(v ? "Saved" : "Removed");
  };
  const origin = window.location.origin;
  return (
    <div className="space-y-4">
      <Card title="Google (Gmail and Google Calendar)" description="OAuth client IDs identify the app; they are not secrets. Tokens stay in this tab's memory.">
        <Field label="OAuth Client ID" value={setting("google")} placeholder="1234-abc.apps.googleusercontent.com" valid={(v) => /\.apps\.googleusercontent\.com$/.test(v)} onSave={(v) => save("google", v)} />
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>console.cloud.google.com → create a project → APIs and services → enable the Gmail API and the Google Calendar API.</li>
          <li>OAuth consent screen → External → Testing → add the Gmail address you will connect as a test user.</li>
          <li>
            Credentials → Create OAuth client ID → Web application → Authorised JavaScript origins: <code className="font-mono text-xs text-fg">{origin}</code>.
          </li>
          <li>Paste the Client ID above. Permissions used: gmail.readonly (read), gmail.send (only when you allow sending), calendar.events (only when you connect the calendar).</li>
        </ol>
      </Card>
      <Card title="Server (Yahoo Mail and AI replies)" description="Yahoo has no public mail REST API: it is read over IMAP with OAuth 2.0, which must run on a server that holds the client secret.">
        <Field label="Server URL" value={setting("api")} placeholder="https://triagedesk-api.onrender.com" valid={(v) => /^https?:\/\/[^\s]+$/.test(v)} onSave={(v) => save("api", v.replace(/\/$/, ""))} />
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>developer.yahoo.com → My Apps → Create an app with API permission "Mail" (read). Yahoo must approve Mail access for the app.</li>
          <li>
            Redirect URI: <code className="font-mono text-xs text-fg">{"<server URL>"}/providers/yahoo/callback</code>.
          </li>
          <li>
            On the server set <code className="font-mono text-xs">YAHOO_CLIENT_ID</code>, <code className="font-mono text-xs">YAHOO_CLIENT_SECRET</code>, <code className="font-mono text-xs">YAHOO_REDIRECT_URI</code>, <code className="font-mono text-xs">WEB_ORIGIN</code>,{" "}
            <code className="font-mono text-xs">SESSION_SECRET</code>; optional <code className="font-mono text-xs">GEMINI_API_KEY</code> for AI replies.
          </li>
        </ol>
      </Card>
    </div>
  );
}

function Preferences() {
  const { prefs, setPrefs, theme, setTheme } = useApp();
  const auth = useAuth();
  // Signed in: the account keeps the name and zone, so they follow the person to any browser.
  const save = (p: { name?: string; timezone?: string }) => (auth.user ? auth.update(p) : setPrefs(p));
  const [name, setName] = useState(prefs.name);
  return (
    <Card title="Preferences" description="Dates in email are read in the sender's timezone and shown in yours; if they differ you are asked to confirm.">
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <label className="w-40 font-medium" htmlFor="name">
            Your name
          </label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border border-line bg-canvas/40 px-2.5 py-1.5 outline-none" />
          <Button size="sm" variant="primary" disabled={!name.trim() || name === prefs.name} onClick={() => save({ name: name.trim() })}>
            Save
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="w-40 font-medium" htmlFor="tz">
            Timezone
          </label>
          <select id="tz" value={prefs.timezone} onChange={(e) => save({ timezone: e.target.value })} className="rounded-lg border border-line bg-surface px-2 py-1.5">
            {[...new Set([prefs.timezone, ...ZONES])].map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-40 font-medium">Theme</span>
          <Segmented
            value={theme}
            onChange={setTheme}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </div>
      </div>
    </Card>
  );
}

function Safety() {
  const { role, setRole, prefs } = useApp();
  const { state, resetWorkspace } = useMailbox();
  return (
    <div className="space-y-4">
      <Card title="How replies leave your inbox" description="Email content is treated as data. Instructions inside an email can never change these rules.">
        <ul className="space-y-2 text-sm">
          {[
            "Nothing is ever sent automatically. Every reply is drafted, reviewed by you, and sent only after you confirm.",
            "Replies that state dates, commitments or answer escalated conversations need an Approver's sign-off.",
            "A reply cannot claim attachments, payments, approvals or dates the conversation does not support.",
            "Payments, legal terms, personal data and commitments need an extra confirmation at send time.",
            "Suspicious emails are quarantined: no reply, no links opened, no actions taken.",
            "Archive only hides a conversation here; nothing is ever deleted.",
          ].map((t) => (
            <li key={t} className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {t}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Roles" description="Who may do what in this workspace.">
        <div className="mb-4 flex flex-wrap gap-2">
          {(Object.keys(ROLES) as Role[]).map((r) => (
            <button key={r} onClick={() => setRole(r)} className={cn("rounded-xl border px-3 py-2 text-left text-sm", role === r ? "border-brand bg-brand-soft ring-2 ring-brand/20" : "border-line hover:bg-subtle")}>
              <div className="flex items-center gap-2 font-medium">
                <Users className="h-3.5 w-3.5" /> {ROLES[r].label} {role === r && <Badge tone="brand">you</Badge>}
              </div>
              <div className="max-w-[16rem] text-xs text-muted">{ROLES[r].description}</div>
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="pb-2 font-semibold">Permission</th>
                {(Object.keys(ROLES) as Role[]).map((r) => (
                  <th key={r} className="pb-2 text-center font-semibold">
                    {ROLES[r].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {PERMISSIONS.map((p) => (
                <tr key={p.id}>
                  <td className="py-2">{p.label}</td>
                  {(Object.keys(ROLES) as Role[]).map((r) => (
                    <td key={r} className="py-2 text-center">
                      {p.roles.includes(r) ? <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="allowed" /> : <Minus className="mx-auto h-4 w-4 text-muted/60" aria-label="not allowed" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Activity log" description="Every consequential action, newest first. Kept in this browser.">
        <ul className="max-h-80 space-y-1.5 overflow-y-auto text-sm">
          {[...state.audit].reverse().map((e, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-32 shrink-0 text-xs text-muted">{localTime(e.at, prefs.timezone)}</span>
              <span className="w-28 shrink-0 font-mono text-xs text-muted">{e.type}</span>
              <span className="min-w-0 flex-1">{e.detail}</span>
            </li>
          ))}
          {state.audit.length === 0 && <li className="text-muted">No activity yet.</li>}
        </ul>
        <Button size="sm" variant="ghost" className="mt-3 text-rose-600" onClick={() => window.confirm("Clear categories, tasks, events, drafts and the log in this browser?") && resetWorkspace()}>
          <Trash2 className="h-4 w-4" /> Reset workspace
        </Button>
      </Card>
    </div>
  );
}

function ImportSection() {
  const importFile = useMailbox((s) => s.importFile);
  const [drag, setDrag] = useState(false);
  const read = async (f: File) => importFile(await f.text(), f.name);
  return (
    <Card title="Import emails from a file" description="CSV or JSON with email_id, subject, body and received_at. Useful for a mailbox export or a test set. Imported mail is read-only.">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) read(f);
        }}
        className={cn("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center", drag ? "border-brand bg-brand-soft" : "border-line hover:border-brand/40")}
      >
        <UploadCloud className="h-8 w-8 text-muted" />
        <span className="mt-2 text-sm font-medium">Drop a .csv or .json file, or click to choose</span>
        <span className="text-xs text-muted">Problems are reported by row and field; nothing is imported until the whole file is valid.</span>
        <input
          type="file"
          accept=".csv,.json,text/csv,application/json"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) read(f);
            e.target.value = "";
          }}
        />
      </label>
      <Button size="sm" className="mt-3" onClick={() => download("inbox_template.csv", fixtureToCsv(DEMO_MAILBOX.messages.filter((m) => /^E\d\d$/.test(m.id)).map((m) => ({ email_id: m.id, subject: m.subject, body: m.body, received_at: m.received_at }))), "text/csv")}>
        <Download className="h-4 w-4" /> Download a CSV template
      </Button>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        <KeyRound className="h-3.5 w-3.5" /> Files cannot set sending permissions; any such column is ignored.
      </p>
    </Card>
  );
}

function AssistantSection() {
  const a = useAssistant();
  const items = useReviewItems();
  const drafts = Object.values(a.results).filter((r) => r.reply).length;
  const api = setting("api");
  const row = (label: string, ok: boolean, text: React.ReactNode) => (
    <div className="flex items-start gap-3 py-2">
      <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full", ok ? "bg-emerald-500 text-white" : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300")}>{ok ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}</span>
      <span className="w-28 shrink-0 text-sm font-medium">{label}</span>
      <span className="text-sm text-muted">{text}</span>
    </div>
  );
  return (
    <div className="space-y-4">
      <Card title="AI assistant" description="Reads the conversations that need you, summarises them, drafts replies and flags what needs your review. It never sends, archives or changes anything.">
        <div className="divide-y divide-line">
          {row("Server", a.status.server === "ok", a.status.server === "none" ? <>Not set. Add <code className="font-mono text-xs">VITE_API_URL</code> to the repo-root .env, or the server URL under Integrations.</> : a.status.server === "down" ? <>Not reachable at <code className="font-mono text-xs">{api}</code>. Start it with <code className="font-mono text-xs">pnpm dev</code>.</> : <>Connected at <code className="font-mono text-xs">{api}</code></>)}
          {row("Model", a.status.available, a.status.available ? a.status.model : <>No <code className="font-mono text-xs">GEMINI_API_KEY</code> on the server, so there are no AI summaries or drafts. Review flags from the rules still work.</>)}
        </div>
        <div className="mt-4 space-y-3 border-t border-line pt-4 text-sm">
          <label className={cn("flex items-start gap-2", !a.status.available && "opacity-50")}>
            <input type="checkbox" className="mt-0.5" checked={a.enabled} disabled={!a.status.available} onChange={(e) => a.setEnabled(e.target.checked)} />
            <span>
              <span className="font-medium">Let the assistant read conversations that need me and draft replies</span>
              <span className="block text-xs text-muted">Only conversations in Urgent, Requires action, To delegate, Meetings and Follow-up, one at a time. Quarantined mail is never sent to the model.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={a.notify} onChange={(e) => a.setNotify(e.target.checked)} />
            <span>
              <span className="font-medium">Desktop notifications when something needs my review</span>
              <span className="block text-xs text-muted">Your browser asks for permission once. Works with the rules alone, too.</span>
            </span>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-line pt-4 text-sm">
          <span>
            <b className="tabular-nums">{a.analyzed}</b> <span className="text-muted">read this session</span>
          </span>
          <span>
            <b className="tabular-nums">{drafts}</b> <span className="text-muted">drafts ready</span>
          </span>
          <span>
            <b className="tabular-nums">{items.length}</b> <span className="text-muted">items need review</span>
          </span>
          <Button size="sm" className="ml-auto" onClick={() => a.checkStatus()}>
            <RefreshCw className="h-4 w-4" /> Check again
          </Button>
        </div>
      </Card>
      <MemoryCard />
      <Card title="What it does, and what it never does">
        <ul className="space-y-2 text-sm">
          {[
            [true, "Summarises each conversation and lists its key facts (deadlines, amounts, names)."],
            [true, "Drafts a reply when one is expected. The draft gets the same claims check as your own edits: one that invents attachments, payments, approvals or dates is withheld."],
            [true, "Flags what needs a person: money, legal terms, personal data, commitments, unhappy senders, unclear requests. Rules add approval and date checks, each labelled."],
            [false, "Never sends, archives, deletes or changes anything. Every reply waits for you to review, save and confirm."],
            [false, "Never follows instructions written inside an email, and never reads quarantined mail."],
            [false, "Never stores email content in the browser. Results stay in this tab's memory."],
          ].map(([ok, t]) => (
            <li key={t as string} className="flex gap-2">
              {ok ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Ban className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />} {t as string}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Privacy" description="Where email text goes when the assistant is on.">
        <p className="text-sm text-muted">
          The text of each conversation it reads goes from your own server to Google's Gemini API (model {a.status.model ?? "not configured"}). The API key stays on the server and never reaches the browser. On the free tier Google may use prompts to improve its products, so use a paid key for private mail.
        </p>
      </Card>
    </div>
  );
}

/** What the assistant remembers per conversation, stored with the account; viewable and erasable. */
function MemoryCard() {
  const auth = useAuth();
  const [items, setItems] = useState<StoredMemory[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = () => listMemory().then(setItems);
  useEffect(() => {
    load();
  }, []);
  if (!auth.user)
    return (
      <Card title="Memory" description="Sign in to let the assistant remember each conversation across visits and devices.">
        <p className="text-sm text-muted">Without an account nothing is remembered: each conversation is read from the start.</p>
      </Card>
    );
  return (
    <Card title="Memory" description="For each conversation the assistant keeps notes: a summary, facts, tasks, decisions and open questions. A new email is read together with these notes and related conversations, instead of starting over. Email bodies are not stored.">
      {items === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">Nothing remembered yet. Notes appear here as the assistant reads your conversations.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((m) => (
            <li key={m.thread_key} className="py-2.5">
              <button onClick={() => setOpen(open === m.thread_key ? null : m.thread_key)} className="flex w-full items-center gap-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.subject || "(no subject)"}</span>
                  <span className="block truncate text-xs text-muted">{m.summary}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {m.messages_read} read · {m.tasks.filter((t) => !t.done).length} open tasks
                </span>
              </button>
              {open === m.thread_key && (
                <div className="mt-2 space-y-1.5 rounded-xl bg-subtle p-3 text-xs">
                  {m.facts.length > 0 && <p><b>Facts:</b> {m.facts.join("; ")}</p>}
                  {m.tasks.length > 0 && <p><b>Tasks:</b> {m.tasks.map((t) => `${t.done ? "✓ " : ""}${t.text}${t.due ? ` (due ${t.due})` : ""}`).join("; ")}</p>}
                  {m.decisions.length > 0 && <p><b>Decisions:</b> {m.decisions.join("; ")}</p>}
                  {m.open_questions.length > 0 && <p><b>Open questions:</b> {m.open_questions.join("; ")}</p>}
                  {m.participants.length > 0 && <p className="text-muted">With {m.participants.join(", ")}</p>}
                  <button onClick={() => forgetMemory(m.thread_key).then(load)} className="font-medium text-rose-600 hover:underline">
                    Forget this conversation
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!!items?.length && (
        <Button size="sm" variant="ghost" className="mt-3 text-rose-600" onClick={() => window.confirm("Forget everything the assistant remembers?") && forgetMemory().then(load)}>
          <Trash2 className="h-4 w-4" /> Forget everything
        </Button>
      )}
    </Card>
  );
}
