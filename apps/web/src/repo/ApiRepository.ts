import { LintRejected, type ClassifyResult, type DecisionPatch, type Repository, type SavedRun, type ThreadAction } from "./Repository";

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:4000";

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API_URL + path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok) return json as T;
  if (res.status === 422 && json.violations) throw new LintRejected(json.violations);
  throw new ApiError(json.error ?? `HTTP ${res.status}`, res.status, json.issues);
}

export interface ApiHealth {
  ok: boolean;
  ai?: { enabled: boolean; model: string };
}

/** Waits for the API (Render's free tier can take ~50 s to wake). Resolves null if it never answers. */
export async function apiHealth(timeoutMs = 70_000): Promise<ApiHealth | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}/health`, { signal: ctl.signal });
    const json = await res.json();
    return res.ok && json.ok === true && json.policy?.auto_send === false ? json : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiHealthy(timeoutMs = 70_000): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}/health`, { signal: ctl.signal });
    const json = await res.json();
    return res.ok && json.ok === true && json.policy?.auto_send === false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Express + MongoDB persistence (apps/api). Triage and lint run again on the server. */
export class ApiRepository implements Repository {
  readonly kind = "api" as const;

  importFixture(input: unknown, source: string) {
    // Raw text is parsed here; malformed JSON gets the same readable error shape as schema errors.
    let fixture = input;
    if (typeof input === "string") {
      try {
        fixture = JSON.parse(input);
      } catch (e) {
        return Promise.reject(new ApiError("invalid fixture", 400, [{ path: "(file)", message: `not valid JSON (${(e as Error).message})` }]));
      }
    }
    return call<SavedRun>("POST", "/runs", { fixture, source });
  }

  async getRun(runId: string) {
    try {
      return await call<SavedRun>("GET", `/runs/${encodeURIComponent(runId)}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  }

  async latest() {
    try {
      return await call<SavedRun>("GET", "/runs/latest");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  }

  saveDraft(runId: string, threadKey: string, body: string) {
    return call<SavedRun>("PUT", `/runs/${encodeURIComponent(runId)}/drafts/${encodeURIComponent(threadKey)}`, { body });
  }

  editDecision(runId: string, emailId: string, patch: DecisionPatch) {
    return call<SavedRun>("PATCH", `/runs/${encodeURIComponent(runId)}/decisions/${encodeURIComponent(emailId)}`, patch);
  }

  preview(runId: string, emailId: string, action: "label" | "archive") {
    return call<SavedRun>("POST", `/runs/${encodeURIComponent(runId)}/preview`, { email_id: emailId, action });
  }

  markReviewed(runId: string) {
    return call<SavedRun>("POST", `/runs/${encodeURIComponent(runId)}/save`);
  }

  act(runId: string, threadKey: string, action: ThreadAction, opts: { to?: string; note?: string } = {}) {
    return call<SavedRun>("POST", `/runs/${encodeURIComponent(runId)}/actions`, { thread_key: threadKey, action, ...opts });
  }

  classify(subject: string, body: string) {
    return call<ClassifyResult>("POST", "/classify", subject ? { subject, body } : { body });
  }
}
