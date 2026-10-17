import type { TriageResult } from "@c16/core";

export interface SavedRun { runId: string; result: TriageResult; reviewed: boolean }

export interface Repository {
  createRun(fixture: unknown): Promise<SavedRun>;
  getRun(runId: string): Promise<SavedRun | null>;
  saveDraft(runId: string, threadKey: string, body: string): Promise<void>;
  previewAction(runId: string, emailId: string, action: "label" | "archive"): Promise<void>;
  saveRun(runId: string): Promise<void>;
}
// TODO(B): LocalRepository (localStorage) and ApiRepository (fetch VITE_API_URL); pick via VITE_REPO=local|api
