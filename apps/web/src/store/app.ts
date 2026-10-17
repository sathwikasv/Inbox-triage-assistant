import { create } from "zustand";
import { toast as sonner } from "sonner";
import type { Role } from "@c16/core";

export type Theme = "light" | "dark";

const read = <T>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* preference not kept */
  }
};
const applyTheme = (t: Theme) => document.documentElement.classList.toggle("dark", t === "dark");

const browserZone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
})();

export interface Prefs {
  name: string;
  timezone: string;
  showDemo: boolean; // keep the labelled demo accounts in the inbox
}

interface AppState {
  role: Role;
  theme: Theme;
  prefs: Prefs;
  setRole(r: Role): void;
  setTheme(t: Theme): void;
  setPrefs(p: Partial<Prefs>): void;
  toast(text: string, tone?: "ok" | "info" | "warn"): void;
}

export const useApp = create<AppState>((set, get) => ({
  role: read<Role>("c16.role", "reviewer"),
  theme: (() => {
    const t = read<Theme>("c16.theme", "light");
    applyTheme(t);
    return t;
  })(),
  prefs: { name: "Riya Sharma", timezone: browserZone, showDemo: true, ...read<Partial<Prefs>>("c16.prefs", {}) },
  setRole(role) {
    write("c16.role", role);
    set({ role });
    sonner(`You are now acting as ${role[0].toUpperCase()}${role.slice(1)}`);
  },
  setTheme(theme) {
    write("c16.theme", theme);
    applyTheme(theme);
    set({ theme });
  },
  setPrefs(p) {
    const prefs = { ...get().prefs, ...p };
    write("c16.prefs", prefs);
    set({ prefs });
  },
  toast(text, tone = "ok") {
    if (tone === "warn") sonner.warning(text);
    else if (tone === "info") sonner.info(text);
    else sonner.success(text);
  },
}));
