import { create } from "zustand";
import { FixtureError, type LintViolation } from "@c16/core";
import { apiHealth, createRepository, DEFAULT_REPO, LintRejected, type DecisionPatch, type RepoKind, type Repository, type SavedRun, type ThreadAction } from "../repo";

export interface ImportError {
  title: string;
  issues: { path: string; message: string }[];
}

export type ApiStatus = "not used" | "waking" | "ready" | "offline";

export interface Toast {
  id: number;
  text: string;
  tone: "ok" | "info" | "warn";
}

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
  toasts: Toast[];
  setUseModelDrafts(v: boolean): void;
  boot(): Promise<void>;
  switchRepo(kind: RepoKind): Promise<void>;
  importFixture(input: unknown, source: string): Promise<boolean>;
  saveDraft(threadKey: string, body: string): Promise<LintViolation[] | null>;
  editDecision(emailId: string, patch: DecisionPatch): Promise<void>;
  preview(emailId: string, action: "label" | "archive"): Promise<void>;
  act(threadKey: string, action: ThreadAction, opts?: { to?: string; note?: string }): Promise<void>;
  markReviewed(): Promise<void>;
  toast(text: string, tone?: Toast["tone"]): void;
  clearErrors(): void;
}

function toImportError(e: unknown): ImportError {
  if (e instanceof FixtureError) return { title: "The file was not imported", issues: e.issues };
  const err = e as Error & { issues?: ImportError["issues"] };
  if (err.issues) return { title: "The file was not imported", issues: err.issues };
  return { title: "The file was not imported", issues: [{ path: "(file)", message: err.message ?? String(e) }] };
}

let toastId = 0;

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
    toasts: [],
    setUseModelDrafts: (v) => set({ useModelDrafts: v }),

    toast(text, tone = "ok") {
      const id = ++toastId;
      set({ toasts: [...get().toasts, { id, text, tone }] });
      setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 4500);
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
