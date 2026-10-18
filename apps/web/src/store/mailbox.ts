import { useMemo } from "react";
import { create } from "zustand";
import {
  ActionError,
  EMPTY_STATE,
  FixtureError,
  acceptProposal,
  buildMailboxView,
  loadInput,
  recordSent,
  sendCheck,
  type CalendarEvent,
  type MailAccount,
  type MailboxData,
  type MailboxState,
  type MailboxView,
  type MailMessage,
} from "@c16/core";
import { DEMO_EVENTS, DEMO_MAILBOX } from "../lib/demoMailbox";
import { CALENDAR_PROVIDERS, MAIL_PROVIDERS, serverGmailAccounts, setting } from "../lib/providers";
import { useApp } from "./app";
import { useAssistant } from "./assistant";
import { useAuth } from "./auth";

const STATE_KEY = "c16.mailbox.state.v1";
const IMPORT_KEY = "c16.mailbox.imported.v1";
const KNOWN_KEY = "c16.mailbox.known.v1"; // which mailboxes were connected (provider + address only; never tokens)

export interface KnownMailbox {
  provider: "gmail" | "yahoo";
  address: string;
  company?: string;
  display_name?: string;
}

const CONSUMER = /^(gmail|googlemail|yahoo|ymail|rocketmail|outlook|hotmail|live|msn|icloud|me|proton|protonmail|aol)\./i;
/** A sensible company label for an address: "alex@acme.com" → "Acme", "me@gmail.com" → "Personal". */
export function inferCompany(address: string): string {
  const domain = address.split("@")[1]?.toLowerCase() ?? "";
  if (!domain || CONSUMER.test(domain)) return "Personal";
  const parts = domain.split(".");
  const second = ["co", "com", "org", "net", "ac", "gov", "edu"];
  const name = parts.length >= 3 && second.includes(parts[parts.length - 2]) ? parts[parts.length - 3] : parts[parts.length - 2] ?? parts[0];
  return name
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

interface Mailbox {
  account: MailAccount;
  messages: MailMessage[];
}
export interface CalendarLink {
  calendar: "google";
  address: string;
  events: CalendarEvent[];
}

const load = <T>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
};
const save = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* not kept */
  }
};

const errorText = (e: unknown) => (e instanceof ActionError && e.reasons.length ? `${e.message}: ${e.reasons.join("; ")}` : e instanceof FixtureError ? e.issues.map((i) => `${i.path}: ${i.message}`).join("; ") : (e as Error).message);

interface MailboxStore {
  state: MailboxState; // everything a person decided (persisted in this browser)
  imported: Mailbox[]; // mailboxes loaded from a CSV/JSON file (persisted)
  connected: Mailbox[]; // live provider mailboxes (memory only; tokens never touch storage)
  calendars: CalendarLink[]; // live calendars (memory only)
  busy: Record<string, boolean>;
  known: KnownMailbox[];
  apply(fn: (s: MailboxState) => MailboxState, ok?: string): boolean;
  /** Signs in an account. A second, third... account of the same provider is added; the same address updates in place. */
  connect(provider: "gmail" | "yahoo", opts?: { company?: string; hint?: string }): Promise<void>;
  /** Names the company or workspace an account belongs to ("Fynd Retail", "Personal"). */
  setAccountCompany(accountId: string, company: string): void;
  refresh(accountId: string): Promise<void>;
  restore(): Promise<void>;
  /** Signed in with Google: connect Gmail quietly with the server's grant (no popup). */
  connectLinkedGmail(): Promise<void>;
  disconnect(accountId: string): Promise<void>;
  enableSend(accountId: string): Promise<void>;
  send(view: MailboxView, threadKey: string, confirmed: string[]): Promise<boolean>;
  connectCalendar(calendar: "google"): Promise<void>;
  addToCalendar(view: MailboxView, proposalId: string, edits: Parameters<typeof acceptProposal>[3]): Promise<boolean>;
  importFile(text: string, name: string): boolean;
  removeImport(accountId: string): void;
  resetWorkspace(): void;
}

const actor = () => useApp.getState().prefs.name;
const now = () => new Date().toISOString();

export const useMailbox = create<MailboxStore>((set, get) => {
  const setState = (state: MailboxState) => {
    save(STATE_KEY, state);
    set({ state });
  };
  const busy = async (key: string, fn: () => Promise<void>) => {
    set({ busy: { ...get().busy, [key]: true } });
    try {
      await fn();
    } catch (e) {
      useApp.getState().toast(errorText(e), "warn");
    } finally {
      set({ busy: { ...get().busy, [key]: false } });
    }
  };
  const upsert = (list: Mailbox[], m: Mailbox) => [...list.filter((x) => x.account.id !== m.account.id), m];
  const remember = (k: KnownMailbox[]) => {
    save(KNOWN_KEY, k);
    set({ known: k });
  };
  const connected = (r: Mailbox, company?: string) => {
    const p = r.account.provider as KnownMailbox["provider"];
    const known = get().known.find((k) => k.provider === p && k.address === r.account.address);
    const label = company?.trim() || r.account.company || known?.company || inferCompany(r.account.address);
    const account: MailAccount = { ...r.account, company: label };
    set({ connected: upsert(get().connected, { ...r, account }) });
    remember([...get().known.filter((k) => !(k.provider === p && k.address === r.account.address)), { provider: p, address: r.account.address, company: label, display_name: account.display_name }]);
    // Real mail is here: the fictional demo mailboxes step aside (they can be shown again in Settings).
    if (useApp.getState().prefs.showDemo) useApp.getState().setPrefs({ showDemo: false });
  };

  return {
    state: load(STATE_KEY, EMPTY_STATE),
    imported: (() => {
      try {
        return JSON.parse(localStorage.getItem(IMPORT_KEY) ?? "[]") as Mailbox[];
      } catch {
        return [];
      }
    })(),
    connected: [],
    calendars: [],
    busy: {},
    known: (() => {
      try {
        return (JSON.parse(localStorage.getItem(KNOWN_KEY) ?? "[]") as (KnownMailbox & { provider: string })[]).filter((k): k is KnownMailbox => k.provider === "gmail" || k.provider === "yahoo");
      } catch {
        return [];
      }
    })(),

    apply(fn, ok) {
      try {
        setState(fn(get().state));
        if (ok) useApp.getState().toast(ok);
        return true;
      } catch (e) {
        useApp.getState().toast(errorText(e), "warn");
        return false;
      }
    },

    connect: (provider, opts) =>
      busy(`connect:${provider}`, async () => {
        const client = MAIL_PROVIDERS[provider]!;
        const need = client.setupNeeded();
        if (need) throw new Error(need);
        const r = await client.connect({ hint: opts?.hint });
        const again = get().connected.some((c) => c.account.id === r.account.id);
        connected(r, opts?.company);
        useApp.getState().toast(`${r.account.address} ${again ? "refreshed" : "connected"}: ${r.messages.length} emails loaded (read-only)`);
      }),

    setAccountCompany(accountId, company) {
      const label = company.trim().slice(0, 80);
      const named = (a: MailAccount) => (a.id === accountId ? { ...a, company: label || undefined } : a);
      const hit = get().connected.find((c) => c.account.id === accountId);
      if (hit) {
        set({ connected: get().connected.map((c) => ({ ...c, account: named(c.account) })) });
        remember(get().known.map((k) => (k.provider === hit.account.provider && k.address === hit.account.address ? { ...k, company: label || undefined } : k)));
      }
      const imp = get().imported.map((c) => ({ ...c, account: named(c.account) }));
      save(IMPORT_KEY, imp);
      set({ imported: imp });
      // The Gmail linked to a Google login keeps its label on the server too.
      const api = setting("api").replace(/\/$/, "");
      if (hit?.account.provider === "gmail" && serverGmailAccounts().some((a) => a.email === hit.account.address) && api) {
        fetch(`${api}/auth/google/accounts`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: hit.account.address, company: label }) }).catch(() => undefined);
      }
    },

    refresh: (accountId) =>
      busy(`refresh:${accountId}`, async () => {
        const m = get().connected.find((x) => x.account.id === accountId);
        if (!m) throw new Error("this account is not connected");
        const messages = await MAIL_PROVIDERS[m.account.provider]!.refresh(m.account);
        set({ connected: upsert(get().connected, { account: { ...m.account, last_sync_at: now(), status: "ok" }, messages }) });
        useApp.getState().toast(`${m.account.address} refreshed: ${messages.length} emails`);
      }),

    // Signed in with Google: every Gmail linked to the login connects quietly with the server's grants (no popup).
    async connectLinkedGmail() {
      const gmail = MAIL_PROVIDERS.gmail!;
      if (gmail.setupNeeded() || !gmail.restoreAll || get().busy["connect:gmail"]) return;
      set({ busy: { ...get().busy, "connect:gmail": true } });
      try {
        for (const r of await gmail.restoreAll()) if (!get().connected.some((c) => c.account.id === r.account.id)) connected(r);
      } catch {
        /* the reconnect bar offers one click */
      } finally {
        set({ busy: { ...get().busy, "connect:gmail": false } });
      }
    },

    // After a reload: every account a provider or the server still holds comes back (several Yahoo sessions, linked Gmail).
    async restore() {
      for (const client of Object.values(MAIL_PROVIDERS)) {
        if (!client || client.setupNeeded()) continue;
        const found = client.restoreAll ? await client.restoreAll().catch(() => []) : [await client.restore?.().catch(() => null)].filter((x): x is Mailbox => !!x);
        for (const r of found) if (!get().connected.some((c) => c.account.id === r.account.id)) connected(r);
      }
    },

    disconnect: (accountId) =>
      busy(`disconnect:${accountId}`, async () => {
        const m = get().connected.find((x) => x.account.id === accountId);
        if (m) await MAIL_PROVIDERS[m.account.provider]!.disconnect(m.account);
        if (m) remember(get().known.filter((k) => !(k.provider === m.account.provider && k.address === m.account.address)));
        set({ connected: get().connected.filter((x) => x.account.id !== accountId) });
        useApp.getState().toast("Disconnected. Its emails were removed from this tab.");
      }),

    enableSend: (accountId) =>
      busy(`send-permission:${accountId}`, async () => {
        const m = get().connected.find((x) => x.account.id === accountId);
        if (!m) throw new Error("connect the account first");
        await MAIL_PROVIDERS[m.account.provider]!.enableSend(m.account);
        set({ connected: upsert(get().connected, { ...m, account: { ...m.account, send_enabled: true } }) });
        useApp.getState().toast(`Sending enabled for ${m.account.address}. Every send still needs your review and confirmation.`);
      }),

    async send(view, threadKey, confirmed) {
      const role = useApp.getState().role;
      const check = sendCheck(view, get().state, threadKey, role);
      if (!check.ok) {
        useApp.getState().toast(check.blockers.join("; "), "warn");
        return false;
      }
      const th = view.threads.find((t) => t.key === threadKey)!;
      const acc = view.accounts.find((a) => a.id === th.account_id)!;
      let ok = false;
      await busy(`send:${threadKey}`, async () => {
        if (acc.mode === "connected") {
          const d = get().state.drafts[threadKey]!;
          const target = view.messages.find((m) => m.id === d.in_reply_to)!;
          const r = await MAIL_PROVIDERS[acc.provider]!.send(acc, { to: d.to, cc: d.cc, subject: d.subject, body: d.body, in_reply_to: target });
          setState(recordSent(view, get().state, threadKey, role, confirmed, actor(), now(), { message_id: r.message_id }).state);
          useApp.getState().toast(`Sent from ${acc.address}`);
        } else {
          setState(recordSent(view, get().state, threadKey, role, confirmed, actor(), now()).state);
          useApp.getState().toast("Sent in demo mode: simulated, no email left the app");
        }
        ok = true;
      });
      return ok;
    },

    connectCalendar: (calendar) =>
      busy(`calendar:${calendar}`, async () => {
        const client = CALENDAR_PROVIDERS[calendar];
        const need = client.setupNeeded();
        if (need) throw new Error(need);
        const r = await client.connect();
        set({ calendars: [...get().calendars.filter((c) => c.calendar !== calendar), { calendar, ...r }] });
        useApp.getState().toast(`${client.label} connected: ${r.events.length} events loaded`);
      }),

    async addToCalendar(view, proposalId, edits) {
      const link = get().calendars[0];
      let ok = false;
      await busy(`event:${proposalId}`, async () => {
        const target = link?.calendar ?? "demo";
        const { state, event } = acceptProposal(view, get().state, proposalId, edits, target, actor(), now());
        if (link) {
          const created = await CALENDAR_PROVIDERS[link.calendar].create(event);
          setState({ ...state, events: state.events.map((e) => (e.id === event.id ? { ...created, id: event.id } : e)) });
          useApp.getState().toast(`Added to ${CALENDAR_PROVIDERS[link.calendar].label}`);
        } else {
          setState(state);
          useApp.getState().toast("Added to the demo calendar (no calendar connected)");
        }
        ok = true;
      });
      return ok;
    },

    importFile(text, name) {
      try {
        const raw = loadInput(text) as { records: { emails: { email_id: string; subject: string; body: string; received_at: string | null; thread_id?: string }[] } };
        const id = `import:${name}`;
        const account: MailAccount = { id, provider: "import", address: name, display_name: name, mode: "import", status: "ok", last_sync_at: now(), send_enabled: false };
        const messages: MailMessage[] = raw.records.emails.map((e) => ({
          id: `${id}:${e.email_id}`,
          account_id: id,
          ...(e.thread_id ? { thread_id: e.thread_id } : {}),
          from: { name: "Sender not in file", email: "unknown@imported.file" },
          to: [],
          cc: [],
          subject: e.subject,
          body: e.body,
          received_at: e.received_at ?? new Date(0).toISOString(),
          direction: "inbound",
          read: false,
          starred: false,
          attachments: [],
        }));
        // Validate exactly as the engine will see it before keeping anything.
        buildMailboxView({ user: { name: "check", addresses: [], timezone: "UTC" }, accounts: [account], messages }, EMPTY_STATE, { now: now() });
        const imported = [...get().imported.filter((x) => x.account.id !== id), { account, messages }];
        save(IMPORT_KEY, imported);
        set({ imported });
        useApp.getState().toast(`${name}: ${messages.length} emails imported`);
        return true;
      } catch (e) {
        useApp.getState().toast(`Not imported: ${errorText(e)}`, "warn");
        return false;
      }
    },

    removeImport(accountId) {
      const imported = get().imported.filter((x) => x.account.id !== accountId);
      save(IMPORT_KEY, imported);
      set({ imported });
    },

    resetWorkspace() {
      setState(EMPTY_STATE);
      useApp.getState().toast("Workspace reset: categories, tasks, events and drafts cleared");
    },
  };
});

let shared: { deps: unknown[]; view: MailboxView } | null = null;

/** The analysed mailbox for every visible account, recomputed when data or decisions change (once, shared by every component). */
export function useMailboxView(): MailboxView {
  const { state, imported, connected, calendars } = useMailbox();
  const prefs = useApp((s) => s.prefs);
  const results = useAssistant((s) => s.results);
  // The fictional demo mailboxes are for visitors without an account. Someone signed in sees only their own mail,
  // even if the browser still carries a demo flag from an earlier visit; with nothing loaded they get a connect prompt.
  const signedIn = useAuth((s) => s.status === "signed_in");
  const showDemo = prefs.showDemo && !signedIn;
  return useMemo(() => {
    const deps = [state, imported, connected, calendars, prefs, results, signedIn];
    if (shared && shared.deps.every((d, i) => d === deps[i])) return shared.view;
    const view = analyse();
    shared = { deps, view };
    return view;
    function analyse() {
    const boxes = [...(showDemo ? [{ accounts: DEMO_MAILBOX.accounts, messages: DEMO_MAILBOX.messages }] : []), ...[...imported, ...connected].map((b) => ({ accounts: [b.account], messages: b.messages }))];
    const data: MailboxData = {
      user: { name: prefs.name, timezone: prefs.timezone, addresses: [...DEMO_MAILBOX.user.addresses, ...[...imported, ...connected].map((b) => b.account.address)] },
      accounts: boxes.flatMap((b) => b.accounts),
      messages: boxes.flatMap((b) => b.messages),
    };
    const live = connected.length > 0 || imported.length > 0 || !showDemo;
    const external = [...(showDemo ? DEMO_EVENTS : []), ...calendars.flatMap((c) => c.events)];
    const merged = { ...state, events: [...state.events, ...external.filter((e) => !state.events.some((x) => x.id === e.id))] };
    // The AI assistant's category opinions, for the conversations it has read.
    const aiCategories = Object.fromEntries(Object.values(results).filter((r) => r.category).map((r) => [r.lead_message, { category: r.category!, reason: r.category_reason ?? "it read the whole conversation" }]));
    return buildMailboxView(data, merged, { now: live ? new Date().toISOString() : DEMO_MAILBOX.demo_clock, aiCategories });
    }
  }, [state, imported, connected, calendars, prefs, results, signedIn]);
}
