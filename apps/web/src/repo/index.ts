import { LocalRepository } from "./LocalRepository";
import { ApiRepository } from "./ApiRepository";
import type { Repository } from "./Repository";

export * from "./Repository";
export { API_URL, apiHealthy, apiHealth, type ApiHealth } from "./ApiRepository";

export type RepoKind = "local" | "api";

/** VITE_REPO=api uses apps/api (MongoDB); VITE_REPO=local (default) keeps everything in this browser. */
export const DEFAULT_REPO: RepoKind = import.meta.env.VITE_REPO === "api" ? "api" : "local";

export function createRepository(kind: RepoKind = DEFAULT_REPO): Repository {
  return kind === "api" ? new ApiRepository() : new LocalRepository();
}
