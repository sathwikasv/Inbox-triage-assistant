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
import { CALENDAR_PROVIDERS, MAIL_PROVIDERS } from "../lib/providers";
import { useApp } from "./app";

const STATE_KEY = "c16.mailbox.state.v1";
const IMPORT_KEY = "c16.mailbox.imported.v1";
const KNOWN_KEY = "c16.mailbox.known.v1"; // which mailboxes were connected (provider + address only; never tokens)

export interface KnownMailbox {
  provider: "gmail" | "outlook" | "yahoo";
  address: string;
}

interface Mailbox {
  account: MailAccount;
  messages: MailMessage[];
}
export interface CalendarLink {
  calendar: "google" | "outlook";
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
  connect(provider: "gmail" | "outlook" | "yahoo"): Promise<void>;
  refresh(accountId: string): Promise<void>;
  restore(): Promise<void>;
  disconnect(accountId: string): Promise<void>;
  enableSend(accountId: string): Promise<void>;
  send(view: MailboxView, threadKey: string, confirmed: string[]): Promise<boolean>;
  connectCalendar(calendar: "google" | "outlook"): Promise<void>;
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
  const connected = (r: Mailbox) => {
    set({ connected: upsert(get().connected, r) });
    const p = r.account.provider as KnownMailbox["provider"];
    remember([...get().known.filter((k) => !(k.provider === p && k.address === r.account.address)), { provider: p, address: r.account.address }]);
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
        return JSON.parse(localStorage.getItem(KNOWN_KEY) ?? "[]") as KnownMailbox[];
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

    connect: (provider) =>
      busy(`connect:${provider}`, async () => {
        const client = MAIL_PROVIDERS[provider]!;
        const need = client.setupNeeded();
        if (need) throw new Error(need);
        const r = await client.connect();
        connected(r);
        useApp.getState().toast(`${r.account.address} connected: ${r.messages.length} emails loaded (read-only)`);
      }),

    refresh: (accountId) =>
      busy(`refresh:${accountId}`, async () => {
        const m = get().connected.find((x) => x.account.id === accountId);
        if (!m) throw new Error("this account is not connected");
        const messages = await MAIL_PROVIDERS[m.account.provider]!.refresh(m.account);
        set({ connected: upsert(get().connected, { account: { ...m.account, last_sync_at: now(), status: "ok" }, messages }) });
        useApp.getState().toast(`${m.account.address} refreshed: ${messages.length} emails`);
      }),

    async restore() {
      for (const k of get().known) {
        const client = MAIL_PROVIDERS[k.provider];
        if (!client?.restore || client.setupNeeded() || get().connected.some((c) => c.account.provider === k.provider && c.account.address === k.address)) continue;
        const r = await client.restore().catch(() => null);
        if (r && r.account.address === k.address) connected(r);
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
  return useMemo(() => {
    const deps = [state, imported, connected, calendars, prefs];
    if (shared && shared.deps.every((d, i) => d === deps[i])) return shared.view;
    const view = analyse();
    shared = { deps, view };
    return view;
    function analyse() {
    const boxes = [...(prefs.showDemo ? [{ accounts: DEMO_MAILBOX.accounts, messages: DEMO_MAILBOX.messages }] : []), ...[...imported, ...connected].map((b) => ({ accounts: [b.account], messages: b.messages }))];
    const data: MailboxData = {
      user: { name: prefs.name, timezone: prefs.timezone, addresses: [...DEMO_MAILBOX.user.addresses, ...[...imported, ...connected].map((b) => b.account.address)] },
      accounts: boxes.flatMap((b) => b.accounts),
      messages: boxes.flatMap((b) => b.messages),
    };
    const live = connected.length > 0 || imported.length > 0 || !prefs.showDemo;
    const external = [...(prefs.showDemo ? DEMO_EVENTS : []), ...calendars.flatMap((c) => c.events)];
    const merged = { ...state, events: [...state.events, ...external.filter((e) => !state.events.some((x) => x.id === e.id))] };
    return buildMailboxView(data, merged, { now: live ? new Date().toISOString() : DEMO_MAILBOX.demo_clock });
    }
  }, [state, imported, connected, calendars, prefs]);
}
