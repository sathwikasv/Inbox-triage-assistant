import { create } from "zustand";
import { toast as sonner } from "sonner";
import { FixtureError, type LintViolation } from "@c16/core";
import { apiHealth, createRepository, DEFAULT_REPO, LintRejected, type DecisionPatch, type RepoKind, type Repository, type Role, type SavedRun, type ThreadAction } from "../repo";

export interface ImportError {
  title: string;
  issues: { path: string; message: string }[];
}

export type ApiStatus = "not used" | "waking" | "ready" | "offline";

export type Theme = "light" | "dark";

// Per-viewer preferences; storage may be blocked (private mode), so every access is guarded.
const pref = {
  get<T extends string>(k: string, fallback: T): T {
    try {
      return (window.localStorage.getItem(k) as T) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(k: string, v: string) {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* preference not kept */
    }
  },
};
const applyTheme = (t: Theme) => document.documentElement.classList.toggle("dark", t === "dark");

interface TriageState {
  repo: Repository;
  apiStatus: ApiStatus;
  ai: { enabled: boolean; model: string | null };
  notice: string | null;
  run: SavedRun | null;
  booted: boolean;
  busy: boolean;
  importError: ImportError | null;
  actionError: string | null;
  useModelDrafts: boolean; // show pre-generated model variants instead of the template (both are linted)
  role: Role;
  theme: Theme;
  setUseModelDrafts(v: boolean): void;
  setRole(r: Role): void;
  setTheme(t: Theme): void;
  approveDraft(threadKey: string): Promise<void>;
  handoff(threadKey: string, how: "copy" | "eml"): Promise<boolean>;
  markReplied(threadKey: string): Promise<void>;
  boot(): Promise<void>;
  switchRepo(kind: RepoKind): Promise<void>;
  importFixture(input: unknown, source: string): Promise<boolean>;
  saveDraft(threadKey: string, body: string): Promise<LintViolation[] | null>;
  editDecision(emailId: string, patch: DecisionPatch): Promise<void>;
  preview(emailId: string, action: "label" | "archive"): Promise<void>;
  act(threadKey: string, action: ThreadAction, opts?: { to?: string; note?: string }): Promise<void>;
  markReviewed(): Promise<void>;
  toast(text: string, tone?: "ok" | "info" | "warn"): void;
  clearErrors(): void;
}

function toImportError(e: unknown): ImportError {
  if (e instanceof FixtureError) return { title: "The file was not imported", issues: e.issues };
  const err = e as Error & { issues?: ImportError["issues"] };
  if (err.issues) return { title: "The file was not imported", issues: err.issues };
  return { title: "The file was not imported", issues: [{ path: "(file)", message: err.message ?? String(e) }] };
}

export const useTriage = create<TriageState>((set, get) => {
  let booting = false;
  const act = async (fn: (run: SavedRun) => Promise<SavedRun>) => {
    const run = get().run;
    if (!run) return;
    set({ busy: true, actionError: null });
    try {
      set({ run: await fn(run) });
    } catch (e) {
      set({ actionError: (e as Error).message });
      throw e;
    } finally {
      set({ busy: false });
    }
  };

  return {
    repo: createRepository(DEFAULT_REPO),
    apiStatus: DEFAULT_REPO === "api" ? "waking" : "not used",
    ai: { enabled: false, model: null },
    notice: null,
    run: null,
    booted: false,
    busy: false,
    importError: null,
    actionError: null,
    useModelDrafts: false,
    role: pref.get<Role>("c16.role", "reviewer"),
    theme: (() => {
      const t = pref.get<Theme>("c16.theme", "light");
      applyTheme(t);
      return t;
    })(),
    setUseModelDrafts: (v) => set({ useModelDrafts: v }),
    setRole(role) {
      pref.set("c16.role", role);
      set({ role });
      sonner(`Now acting as ${role[0].toUpperCase()}${role.slice(1)}`);
    },
    setTheme(theme) {
      pref.set("c16.theme", theme);
      applyTheme(theme);
      set({ theme });
    },

    toast(text, tone = "ok") {
      if (tone === "warn") sonner.warning(text);
      else if (tone === "info") sonner.info(text);
      else sonner.success(text);
    },

    async handoff(threadKey, how) {
      try {
        await act((r) => get().repo.handoff(r.runId, threadKey, how, get().role));
        get().toast(how === "eml" ? "Unsent draft downloaded. Open it in your mail app to send." : "Reply copied. Paste it into your mail app to send.");
        return true;
      } catch (e) {
        get().toast((e as Error).message, "warn");
        return false;
      }
    },

    async markReplied(threadKey) {
      await act((r) => get().repo.markReplied(r.runId, threadKey, get().role))
        .then(() => get().toast("Marked replied"))
        .catch((e) => get().toast((e as Error).message, "warn"));
    },

    async approveDraft(threadKey) {
      await act((r) => get().repo.approveDraft(r.runId, threadKey, get().role))
        .then(() => get().toast("Draft approved. It stays a draft; nothing is sent."))
        .catch((e) => get().toast((e as Error).message, "warn"));
    },

    async boot() {
      if (get().booted || booting) return;
      booting = true;
      if (get().repo.kind === "api") {
        set({ apiStatus: "waking" });
        const health = await apiHealth();
        if (health) set({ apiStatus: "ready", ai: { enabled: !!health.ai?.enabled, model: health.ai?.model ?? null } });
        else
          set({
            apiStatus: "offline",
            repo: createRepository("local"),
            ai: { enabled: false, model: null },
            notice: "The API did not answer, so this session is saved in this browser instead (labelled fallback). Switch back to the API once it is up.",
          });
      }
      try {
        set({ run: await get().repo.latest() });
      } catch (e) {
        set({ actionError: `Could not load the last saved run: ${(e as Error).message}` });
      } finally {
        booting = false;
        set({ booted: true });
      }
    },

    async switchRepo(kind) {
      set({ repo: createRepository(kind), run: null, booted: false, notice: null, apiStatus: kind === "api" ? "waking" : "not used", ai: { enabled: false, model: null }, importError: null, actionError: null });
      await get().boot();
    },

    async importFixture(input, source) {
      set({ busy: true, importError: null });
      try {
        set({ run: await get().repo.importFixture(input, source) });
        return true;
      } catch (e) {
        set({ importError: toImportError(e) });
        return false;
      } finally {
        set({ busy: false });
      }
    },

    async saveDraft(threadKey, body) {
      try {
        await act((r) => get().repo.saveDraft(r.runId, threadKey, body));
        get().toast("Draft saved. Nothing was sent.");
        return null;
      } catch (e) {
        if (e instanceof LintRejected) {
          set({ actionError: null });
          return e.violations;
        }
        return [{ term: "error", reason: (e as Error).message }];
      }
    },

    async editDecision(emailId, patch) {
      await act((r) => get().repo.editDecision(r.runId, emailId, patch))
        .then(() => get().toast(`${emailId} updated by reviewer`, "info"))
        .catch(() => undefined);
    },

    async preview(emailId, action) {
      await act((r) => get().repo.preview(r.runId, emailId, action))
        .then(() => get().toast(`${action === "label" ? "Labels" : "Archive"} previewed for ${emailId}: mailbox unchanged`, "info"))
        .catch(() => undefined);
    },

    async act(threadKey, action, opts) {
      const text = { escalate: `Escalated to ${opts?.to ?? "the team lead"}: recorded, no message sent`, watch: "Added to the watch list", archive: "Marked for archive: preview only, mailbox unchanged" }[action];
      await act((r) => get().repo.act(r.runId, threadKey, action, opts))
        .then(() => get().toast(text, action === "escalate" ? "warn" : "ok"))
        .catch((e) => get().toast((e as Error).message, "warn"));
    },

    async markReviewed() {
      await act((r) => get().repo.markReviewed(r.runId))
        .then(() => get().toast("Reviewed result saved"))
        .catch(() => undefined);
    },

    clearErrors: () => set({ importError: null, actionError: null }),
  };
});
