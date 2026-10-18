import { Link } from "react-router-dom";
import { ArrowRight, BellRing, CalendarClock, CheckCircle2, Inbox, ListTodo, Lock, Mail, MessageSquareWarning, ShieldCheck, Sparkles, Tags, Wand2, type LucideIcon } from "lucide-react";
import { useAuth } from "../store/auth";
import { useApp } from "../store/app";
import { cn } from "../ui";

const FEATURES: { icon: LucideIcon; title: string; text: string; cls: string }[] = [
  { icon: Inbox, title: "One inbox for every account", text: "Gmail, Outlook and Yahoo Mail side by side, with one search and one list of what needs you.", cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  { icon: Tags, title: "Sorted the moment it lands", text: "Urgent, Requires action, Meetings, Waiting, Promotions, Spam and more, each with the reason it was sorted that way.", cls: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
  { icon: ListTodo, title: "Deadlines become tasks", text: "\"Submit the report by Monday 4 PM\" turns into a dated task in the sender's time zone, once you add it.", cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  { icon: CalendarClock, title: "Meetings, with clashes caught", text: "Requests, invitations and reschedules appear on your week, with conflicts shown before you accept.", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  { icon: Wand2, title: "Replies drafted for you", text: "The AI assistant summarises each conversation and drafts a reply. Every claim in it is checked against the email.", cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  { icon: MessageSquareWarning, title: "Told when a person must look", text: "Money, legal terms, personal data, promises and suspicious mail are flagged for your review, never sent on autopilot.", cls: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
];

const STEPS = [
  { title: "Create your account", text: "Your name, email and a password for Triagedesk. Never your email password." },
  { title: "Connect your mailboxes", text: "Sign in on Google, Microsoft or Yahoo's own page. Read-only until you allow sending." },
  { title: "Work from your dashboard", text: "See what needs you, answer with checked drafts, and keep tasks and meetings in one place." },
];

const PROMISES = ["Nothing is sent without your confirmation", "We never ask for your email password", "Access tokens are never stored", "Suspicious emails are quarantined, their instructions ignored"];

/** A small, non-interactive picture of the inbox for the hero. */
function Preview() {
  const rows = [
    { c: "bg-red-500", who: "Prof. Anand Kulkarni", s: "Project report submission", tag: "Urgent", tc: "bg-red-50 text-red-700 ring-red-200" },
    { c: "bg-sky-500", who: "Meera Nair", s: "Quick sync on the pilot", tag: "Meetings", tc: "bg-sky-50 text-sky-700 ring-sky-200" },
    { c: "bg-orange-500", who: "Amit", s: "Rent agreement renewal", tag: "Action", tc: "bg-orange-50 text-orange-700 ring-orange-200" },
    { c: "bg-emerald-500", who: "Myntra", s: "Big Fashion Sale: up to 60% off", tag: "Promotions", tc: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  ];
  return (
    <div className="relative mx-auto w-full max-w-xl" aria-hidden>
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-brand/20 via-violet-400/20 to-rose-400/20 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 h-5 flex-1 rounded-full bg-subtle" />
        </div>
        <ul>
          {rows.map((r) => (
            <li key={r.s} className="relative flex items-center gap-3 border-b border-line py-3 pl-5 pr-4">
              <span className={cn("absolute inset-y-0 left-0 w-1", r.c)} />
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-subtle text-xs font-semibold">{r.who[0]}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{r.who}</span>
                <span className="block truncate text-xs text-muted">{r.s}</span>
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", r.tc)}>{r.tag}</span>
            </li>
          ))}
        </ul>
        <div className="m-4 rounded-xl border border-violet-200 bg-violet-50/70 p-3 dark:border-violet-500/30 dark:bg-violet-500/10">
          <div className="flex items-center gap-2 text-xs font-semibold text-violet-800 dark:text-violet-200">
            <Sparkles className="h-3.5 w-3.5" /> Assistant
          </div>
          <p className="mt-1 text-xs text-fg/80">Meera wants a 30-minute call tomorrow at 15:00 about the pilot numbers. It clashes with your vendor call.</p>
          <div className="mt-2 flex gap-1.5">
            <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium shadow-card">Draft ready</span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">Needs your review</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { guest, continueAsGuest } = useAuth();
  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#0B57D0] via-[#7c4dff] to-[#e5484d] text-white shadow-sm">
              <Mail className="h-[18px] w-[18px]" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Triagedesk</span>
          </Link>
          <nav className="hidden gap-5 text-sm text-muted md:flex">
            <a href="#features" className="hover:text-fg">
              Features
            </a>
            <a href="#how" className="hover:text-fg">
              How it works
            </a>
            <a href="#safety" className="hover:text-fg">
              Safety
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/login" className="rounded-full px-4 py-2 text-sm font-medium hover:bg-fg/[0.06]">
              Sign in
            </Link>
            <Link to="/signup" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-fg shadow-sm hover:bg-brand/90">
              Get started
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 lg:grid-cols-2 lg:pt-20">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted shadow-card">
            <Sparkles className="h-3.5 w-3.5 text-violet-500" /> AI that drafts, never sends on its own
          </span>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Every inbox, sorted.
            <br />
            <span className="bg-gradient-to-r from-[#0B57D0] via-[#7c4dff] to-[#e5484d] bg-clip-text text-transparent">Every reply, checked.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-fg/75">Triagedesk brings Gmail, Outlook and Yahoo Mail into one inbox, sorts each email by what it needs, turns deadlines into tasks and meetings into calendar events, and drafts replies for you to approve.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/signup" className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-brand-fg shadow-pop hover:bg-brand/90">
              Create your free account <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/login" className="rounded-full border border-line bg-surface px-6 py-3 text-sm font-semibold hover:bg-subtle">
              Sign in
            </Link>
          </div>
          <Link
            to="/dashboard"
            onClick={() => {
              if (!guest) continueAsGuest();
              useApp.getState().setPrefs({ showDemo: true }); // the labelled, fictional demo mailboxes
            }}
            className="mt-4 inline-block text-sm font-medium text-brand hover:underline"
          >
            Or explore a demo inbox, no account needed →
          </Link>
          <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-muted">
            <span>Works with</span>
            {[
              ["G", "bg-[#EA4335]", "Gmail"],
              ["O", "bg-[#0078D4]", "Outlook"],
              ["Y", "bg-[#6001D2]", "Yahoo Mail"],
            ].map(([l, c, n]) => (
              <span key={n} className="inline-flex items-center gap-1.5 font-medium text-fg/80">
                <span className={cn("grid h-5 w-5 place-items-center rounded-md text-[10px] font-bold text-white", c)}>{l}</span> {n}
              </span>
            ))}
          </div>
        </div>
        <Preview />
      </section>

      <section id="features" className="border-t border-line bg-surface py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-semibold tracking-tight">Everything your inbox should already do</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted">Built for people who get too much email to read it all, and too much that matters to miss any of it.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-line bg-canvas/40 p-5 transition hover:-translate-y-0.5 hover:shadow-pop">
                <span className={cn("grid h-10 w-10 place-items-center rounded-xl", f.cls)}>
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-semibold tracking-tight">Up and running in three steps</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-line bg-surface p-6 shadow-card">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-bold text-brand-fg">{i + 1}</span>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="safety" className="border-t border-line bg-surface py-16">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 lg:grid-cols-2">
          <div>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">You stay in control</h2>
            <p className="mt-3 text-muted">The assistant prepares; you decide. Replies that mention money, legal terms, personal data or a promise ask for an extra check before they go.</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {PROMISES.map((p) => (
              <li key={p} className="flex items-start gap-2.5 rounded-xl border border-line bg-canvas/40 p-4 text-sm font-medium">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-4xl rounded-3xl bg-gradient-to-br from-[#0B57D0] via-[#5b4dd6] to-[#7c4dff] px-6 py-12 text-center text-white shadow-pop">
          <BellRing className="mx-auto h-8 w-8 opacity-90" />
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">Spend minutes on email, not hours</h2>
          <p className="mx-auto mt-2 max-w-xl text-white/80">Create your account, connect a mailbox and let Triagedesk show you what matters first.</p>
          <Link to="/signup" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#0B57D0] hover:bg-white/90">
            Get started free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-line py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" /> Triagedesk
          </span>
          <span>Drafts only. You send.</span>
          <span className="ml-auto">Built for the Fynd × NMIMS hackathon</span>
        </div>
      </footer>
    </div>
  );
}
