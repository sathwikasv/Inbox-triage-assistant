import { create } from "zustand";
import { FixtureError, type LintViolation } from "@c16/core";
import { apiHealthy, createRepository, DEFAULT_REPO, LintRejected, type DecisionPatch, type RepoKind, type Repository, type SavedRun } from "../repo";

export interface ImportError {
  title: string;
  issues: { path: string; message: string }[];
}

export type ApiStatus = "not used" | "waking" | "ready" | "offline";

interface TriageState {
  repo: Repository;
  apiStatus: ApiStatus;
  notice: string | null;
  run: SavedRun | null;
  booted: boolean;
  busy: boolean;
  importError: ImportError | null;
  actionError: string | null;
  useModelDrafts: boolean; // show pre-generated model variants instead of the template (both are linted)
  setUseModelDrafts(v: boolean): void;
  boot(): Promise<void>;
  switchRepo(kind: RepoKind): Promise<void>;
  importFixture(input: unknown, source: string): Promise<boolean>;
  saveDraft(threadKey: string, body: string): Promise<LintViolation[] | null>;
  editDecision(emailId: string, patch: DecisionPatch): Promise<void>;
  preview(emailId: string, action: "label" | "archive"): Promise<void>;
  markReviewed(): Promise<void>;
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
    notice: null,
    run: null,
    booted: false,
    busy: false,
    importError: null,
    actionError: null,
    useModelDrafts: false,
    setUseModelDrafts: (v) => set({ useModelDrafts: v }),

    async boot() {
      if (get().booted || booting) return;
      booting = true;
      if (get().repo.kind === "api") {
        set({ apiStatus: "waking" });
        if (await apiHealthy()) set({ apiStatus: "ready" });
        else
          set({
            apiStatus: "offline",
            repo: createRepository("local"),
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
      set({ repo: createRepository(kind), run: null, booted: false, notice: null, apiStatus: kind === "api" ? "waking" : "not used", importError: null, actionError: null });
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
      await act((r) => get().repo.editDecision(r.runId, emailId, patch)).catch(() => undefined);
    },

    async preview(emailId, action) {
      await act((r) => get().repo.preview(r.runId, emailId, action)).catch(() => undefined);
    },

    async markReviewed() {
      await act((r) => get().repo.markReviewed(r.runId)).catch(() => undefined);
    },

    clearErrors: () => set({ importError: null, actionError: null }),
  };
});
