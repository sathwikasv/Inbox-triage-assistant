import { create } from "zustand";
import { setting } from "../lib/providers";
import { useApp } from "./app";

// The Triagedesk account (not a mailbox): sign up, sign in, sign out and password reset, via the server's
// /auth routes with an httpOnly cookie. Without a server or database, the app says so and offers to
// continue without an account (the workspace then lives only in this browser).

export interface AppUser {
  id: string;
  email: string;
  name: string;
  timezone: string;
  use: "work" | "personal" | "both";
  onboarding_completed: boolean;
  created_at: string;
}
export type AuthStatus = "loading" | "signed_in" | "signed_out" | "unavailable";
type Result = { ok: true; message?: string } | { ok: false; error: string; field?: string };

const WORKSPACE_KEYS = ["c16.mailbox.state.v1", "c16.mailbox.imported.v1", "c16.mailbox.known.v1", "c16.review.seen", "c16.ai.offer_dismissed"];
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* not kept */
  }
};
const api = () => setting("api").replace(/\/$/, "");

async function call(path: string, method = "GET", body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${api()}/auth${path}`, { method, credentials: "include", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}
const offline = (error: string) => ({ status: 0, json: { error } as Record<string, unknown> });
const failure = (r: { status: number; json: Record<string, unknown> }): Result => ({
  ok: false,
  error: (r.json.error as string) ?? (Array.isArray(r.json.issues) ? (r.json.issues as { message: string }[]).map((i) => i.message).join("; ") : `Something went wrong (${r.status}). Try again.`),
  field: r.json.field as string | undefined,
});

interface AuthStore {
  status: AuthStatus;
  user: AppUser | null;
  /** Why accounts are unavailable: no server configured, server unreachable, or no database. */
  reason: "no-server" | "server-down" | "no-database" | null;
  guest: boolean; // chose to continue without an account
  init(): Promise<void>;
  signup(d: { name: string; email: string; password: string; timezone: string; use: AppUser["use"] }): Promise<Result>;
  login(email: string, password: string): Promise<Result>;
  logout(): Promise<void>;
  forgot(email: string): Promise<Result>;
  reset(token: string, password: string): Promise<Result>;
  update(patch: Partial<Pick<AppUser, "name" | "timezone" | "use" | "onboarding_completed">>): Promise<Result>;
  continueAsGuest(): void;
}

/** One workspace per browser: when a different person signs in, the previous person's workspace is cleared. */
function adopt(user: AppUser) {
  const owner = read("c16.owner");
  if (owner && owner !== user.id) for (const k of WORKSPACE_KEYS) write(k, null);
  write("c16.owner", user.id);
  write("c16.guest", null);
  useApp.getState().setPrefs({ name: user.name, timezone: user.timezone });
  if (owner && owner !== user.id) window.location.assign("/dashboard"); // reload the stores with the empty workspace
}

export const useAuth = create<AuthStore>((set, get) => ({
  status: "loading",
  user: null,
  reason: null,
  guest: read("c16.guest") === "true",

  async init() {
    if (!api()) return set({ status: "unavailable", reason: "no-server" });
    try {
      const r = await call("/me");
      if (r.status === 200) {
        const user = r.json.user as AppUser;
        adopt(user);
        set({ status: "signed_in", user, reason: null });
      } else if (r.status === 401) set({ status: "signed_out", user: null, reason: null });
      else set({ status: "unavailable", user: null, reason: r.status === 503 ? "no-database" : "server-down" });
    } catch {
      set({ status: "unavailable", user: null, reason: "server-down" });
    }
  },
  async signup(d) {
    const r = await call("/signup", "POST", d).catch(() => offline("The server could not be reached. Check your connection and try again."));
    if (r.status !== 201) return failure(r);
    adopt(r.json.user as AppUser);
    set({ status: "signed_in", user: r.json.user as AppUser, guest: false });
    return { ok: true };
  },
  async login(email, password) {
    const r = await call("/login", "POST", { email, password }).catch(() => offline("The server could not be reached. Check your connection and try again."));
    if (r.status !== 200) return failure(r);
    adopt(r.json.user as AppUser);
    set({ status: "signed_in", user: r.json.user as AppUser, guest: false });
    return { ok: true };
  },
  async logout() {
    await call("/logout", "POST", {}).catch(() => undefined);
    write("c16.guest", null);
    set({ status: get().reason ? "unavailable" : "signed_out", user: null, guest: false });
  },
  async forgot(email) {
    const r = await call("/forgot", "POST", { email }).catch(() => offline("The server could not be reached."));
    return r.status === 200 ? { ok: true, message: r.json.message as string } : failure(r);
  },
  async reset(token, password) {
    const r = await call("/reset", "POST", { token, password }).catch(() => offline("The server could not be reached."));
    if (r.status !== 200) return failure(r);
    adopt(r.json.user as AppUser);
    set({ status: "signed_in", user: r.json.user as AppUser });
    return { ok: true };
  },
  async update(patch) {
    const r = await call("/me", "PATCH", patch).catch(() => offline("The server could not be reached."));
    if (r.status !== 200) return failure(r);
    set({ user: r.json.user as AppUser });
    if (patch.name || patch.timezone) useApp.getState().setPrefs({ ...(patch.name ? { name: patch.name } : {}), ...(patch.timezone ? { timezone: patch.timezone } : {}) });
    return { ok: true };
  },
  continueAsGuest() {
    write("c16.guest", "true");
    set({ guest: true });
  },
}));

/** May the app shell open? Signed in, continuing without an account, or no server at all (local use). */
export const canEnter = (a: Pick<AuthStore, "status" | "guest" | "reason">) => a.status === "signed_in" || a.guest || a.reason === "no-server";
