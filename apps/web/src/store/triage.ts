import { create } from "zustand";
import { FixtureError, type LintViolation } from "@c16/core";
import { createRepository, LintRejected, type DecisionPatch, type Repository, type SavedRun } from "../repo";

export interface ImportError {
  title: string;
  issues: { path: string; message: string }[];
}

interface TriageState {
  repo: Repository;
  run: SavedRun | null;
  booted: boolean;
  busy: boolean;
  importError: ImportError | null;
  actionError: string | null;
  boot(): Promise<void>;
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
    repo: createRepository(),
    run: null,
    booted: false,
    busy: false,
    importError: null,
    actionError: null,

    async boot() {
      if (get().booted) return;
      try {
        set({ run: await get().repo.latest() });
      } catch (e) {
        set({ actionError: `Could not load the last saved run: ${(e as Error).message}` });
      } finally {
        set({ booted: true });
      }
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
