import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Circle, Eye, EyeOff, Inbox, Loader2, Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { canEnter, useAuth, type AppUser } from "../store/auth";
import { useApp } from "../store/app";
import { cn } from "../ui";
import { resolveUserTimezone } from "../lib/time";

export type AuthMode = "login" | "signup" | "forgot" | "reset";
const ZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney", "UTC"];
const browserZone = resolveUserTimezone();

/** The same rules the server applies, shown while typing. */
function passwordChecks(pw: string, email: string) {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  return [
    { ok: pw.length >= 8, text: "At least 8 characters" },
    { ok: /[a-z]/i.test(pw) && /\d/.test(pw), text: "Letters and numbers" },
    { ok: !(local.length > 2 && pw.toLowerCase().includes(local)) && !/^(password|12345678|qwerty|letmein|welcome)/i.test(pw), text: "Not your email name or a common password" },
  ];
}

/** Google's "G", as its sign-in button guidelines ask. */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: ReactNode; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-sm font-medium">
        {label}
        {hint}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
    </label>
  );
}
const input = "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-4 focus:ring-brand/15";

function PasswordInput({ value, onChange, autoComplete, id, placeholder }: { value: string; onChange: (v: string) => void; autoComplete: string; id: string; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} placeholder={placeholder} className={cn(input, "pr-11")} required />
      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-fg">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </span>
  );
}

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [use, setUse] = useState<AppUser["use"]>("both");
  const [timezone, setTimezone] = useState(browserZone);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [google, setGoogle] = useState<{ enabled: boolean; reason: string | null }>({ enabled: false, reason: null });

  useEffect(() => {
    setError(params.get("google_error") ? { text: params.get("google_error")! } : null);
    setNotice(null);
  }, [mode, params]);
  useEffect(() => {
    if (mode === "login" || mode === "signup") auth.googleStatus().then(setGoogle);
  }, [mode]);
  useEffect(() => {
    if (auth.status === "signed_in" && mode !== "reset") navigate(from, { replace: true });
  }, [auth.status, mode, from, navigate]);

  const checks = passwordChecks(password, email);
  const strong = checks.every((c) => c.ok);
  const unavailable = auth.status === "unavailable";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if ((mode === "signup" || mode === "reset") && password !== confirm) return setError({ text: "The two passwords do not match.", field: "confirm" });
    if ((mode === "signup" || mode === "reset") && !strong) return setError({ text: "Choose a stronger password (see the checklist).", field: "password" });
    setBusy(true);
    const r =
      mode === "login"
        ? await auth.login(email.trim(), password)
        : mode === "signup"
          ? await auth.signup({ name: name.trim(), email: email.trim(), password, timezone, use })
          : mode === "forgot"
            ? await auth.forgot(email.trim())
            : await auth.reset(params.get("token") ?? "", password);
    setBusy(false);
    if (!r.ok) return setError({ text: r.error, field: r.field });
    if (mode === "forgot") return setNotice(r.message ?? "Check your inbox for a reset link.");
    navigate(mode === "reset" ? "/dashboard" : from, { replace: true });
  };

  const title = { login: "Welcome back", signup: "Create your account", forgot: "Reset your password", reset: "Choose a new password" }[mode];
  const sub = {
    login: "Sign in to your Triagedesk dashboard.",
    signup: "Free. Takes a minute. You connect your mailboxes next.",
    forgot: "Enter the email you signed up with and we'll send a link to choose a new password.",
    reset: "Pick a new password for your Triagedesk account. You'll be signed out on other devices.",
  }[mode];

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#0B57D0] via-[#4f46e5] to-[#7c3aed] p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <Link to="/" className="relative flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 backdrop-blur">
            <Mail className="h-5 w-5" />
          </span>
          <span className="text-xl font-semibold tracking-tight">Triagedesk</span>
        </Link>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">One inbox. Every account. Nothing sent without you.</h2>
          <ul className="mt-6 space-y-3 text-white/85">
            {[
              [Inbox, "Gmail and Yahoo Mail, from every company, in one place"],
              [Sparkles, "Summaries and reply drafts from the AI assistant"],
              [ShieldCheck, "Risky replies and suspicious mail flagged for review"],
            ].map(([Icon, t]) => {
              const I = Icon as typeof Inbox;
              return (
                <li key={t as string} className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15">
                    <I className="h-4 w-4" />
                  </span>
                  {t as string}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-white/60">Your Triagedesk password is separate from your email passwords. We never ask for those.</p>
      </aside>

      <main className="flex min-h-screen flex-col px-4 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <Link to="/" className="flex items-center gap-2 lg:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#0B57D0] to-[#7c3aed] text-white">
              <Mail className="h-4 w-4" />
            </span>
            <span className="font-semibold">Triagedesk</span>
          </Link>
        </div>

        <div className="mx-auto my-auto w-full max-w-md py-10">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-muted">{sub}</p>

          {unavailable && (
            <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {auth.reason === "no-database"
                    ? "Accounts are not switched on yet: this site's database is not connected."
                    : auth.reason === "server-down"
                      ? "The Triagedesk server cannot be reached right now, so signing in is not possible."
                      : "This copy of Triagedesk runs without a server, so there are no accounts."}{" "}
                  You can still use Triagedesk in this browser.
                </span>
              </div>
              <button
                onClick={() => {
                  auth.continueAsGuest();
                  navigate("/dashboard");
                }}
                className="mt-3 rounded-full bg-amber-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 dark:bg-amber-200 dark:text-amber-950"
              >
                Continue without an account
              </button>
            </div>
          )}

          {(mode === "login" || mode === "signup") && (
            <div className="mt-8">
              <button
                type="button"
                onClick={() => auth.google(from)}
                disabled={!google.enabled}
                className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-line bg-surface text-sm font-semibold shadow-sm transition hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
              >
                <GoogleG /> Continue with Google
              </button>
              <p className="mt-2 text-center text-xs text-muted">{google.enabled ? "Signs you in and connects your Gmail (read-only) in one step." : (google.reason ?? "Checking Google sign-in…")}</p>
              <div className="mt-6 flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
              </div>
            </div>
          )}

          <form onSubmit={submit} className={cn("space-y-4", mode === "login" || mode === "signup" ? "mt-6" : "mt-8")} noValidate>
            {mode === "signup" && (
              <Field label="Full name" error={error?.field === "name" ? error.text : undefined}>
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Riya Sharma" className={input} required />
              </Field>
            )}
            {mode !== "reset" && (
              <Field label="Email" error={error?.field === "email" ? error.text : undefined}>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" className={input} required />
              </Field>
            )}
            {mode !== "forgot" && (
              <Field
                label={mode === "reset" ? "New password" : "Password"}
                hint={
                  mode === "login" ? (
                    <Link to="/forgot" className="text-xs font-medium text-brand hover:underline">
                      Forgot password?
                    </Link>
                  ) : undefined
                }
                error={error?.field === "password" ? error.text : undefined}
              >
                <PasswordInput id="password" value={password} onChange={setPassword} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "Your Triagedesk password" : "Create a password"} />
              </Field>
            )}
            {(mode === "signup" || mode === "reset") && (
              <>
                <ul className="grid gap-1 rounded-xl bg-subtle px-3 py-2.5 text-xs">
                  {checks.map((c) => (
                    <li key={c.text} className={cn("flex items-center gap-1.5", c.ok ? "text-emerald-700 dark:text-emerald-300" : "text-muted")}>
                      {c.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />} {c.text}
                    </li>
                  ))}
                </ul>
                <Field label="Confirm password" error={error?.field === "confirm" ? error.text : undefined}>
                  <PasswordInput id="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" placeholder="Type it again" />
                </Field>
              </>
            )}
            {mode === "signup" && (
              <>
                <div>
                  <span className="mb-1.5 block text-sm font-medium">I'll use Triagedesk for</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(["work", "personal", "both"] as const).map((u) => (
                      <button key={u} type="button" onClick={() => setUse(u)} className={cn("rounded-xl border px-3 py-2 text-sm capitalize transition", use === u ? "border-brand bg-brand-soft font-semibold" : "border-line hover:bg-subtle")}>
                        {u === "both" ? "Both" : u}
                      </button>
                    ))}
                  </div>
                </div>
                <Field label="Time zone" hint={<span className="text-xs text-muted">Deadlines are shown in it</span>}>
                  <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={input}>
                    {[...new Set([browserZone, ...ZONES])].map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </select>
                </Field>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span className="text-muted">I understand Triagedesk drafts replies but never sends anything without my confirmation.</span>
                </label>
              </>
            )}

            {error && !["name", "email", "password", "confirm"].includes(error.field ?? "") && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error.text}
              </div>
            )}
            {notice && (
              <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {notice}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || unavailable || (mode === "signup" && !agree) || (mode === "reset" && !params.get("token"))}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-brand-fg shadow-sm transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {{ login: "Sign in", signup: "Create account", forgot: "Send reset link", reset: "Set new password" }[mode]}
            </button>
          </form>

          {mode === "reset" && !params.get("token") && <p className="mt-3 text-sm text-rose-600">This page needs the link from your reset email.</p>}

          <p className="mt-6 text-center text-sm text-muted">
            {mode === "login" ? (
              <>
                New to Triagedesk?{" "}
                <Link to="/signup" className="font-semibold text-brand hover:underline">
                  Create an account
                </Link>
              </>
            ) : mode === "signup" ? (
              <>
                Already have an account?{" "}
                <Link to="/login" className="font-semibold text-brand hover:underline">
                  Sign in
                </Link>
              </>
            ) : (
              <Link to="/login" className="font-semibold text-brand hover:underline">
                Back to sign in
              </Link>
            )}
          </p>
          {mode === "login" && !canEnter(auth) && !unavailable && (
            <p className="mt-3 text-center text-xs text-muted">
              Just looking?{" "}
              <button
                onClick={() => {
                  auth.continueAsGuest();
                  useApp.getState().setPrefs({ showDemo: true });
                  navigate("/dashboard");
                }}
                className="font-medium text-brand hover:underline"
              >
                Explore a demo inbox
              </button>
            </p>
          )}
          <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-muted">
            <Lock className="h-3.5 w-3.5" /> Use your Triagedesk password here, never your Gmail or Yahoo password.
          </p>
        </div>
      </main>
    </div>
  );
}
