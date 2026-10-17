import { LocalRepository } from "./LocalRepository";
import type { Repository } from "./Repository";

export * from "./Repository";

/** VITE_REPO=local (default) keeps everything in this browser. */
export function createRepository(): Repository {
  return new LocalRepository();
}
