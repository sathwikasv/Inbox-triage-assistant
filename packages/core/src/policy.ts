import type { Policy } from "./types.js";
// Immutable by construction. Nothing in core, api or web may produce auto_send: true.
export const POLICY: Policy = Object.freeze({ draft_only: true, auto_send: false } as const);

/** True only for exactly { draft_only: true, auto_send: false }; used to prove a run left the policy untouched. */
export function policyIntact(p: unknown = POLICY): boolean {
  if (!p || typeof p !== "object") return false;
  const keys = Object.keys(p).sort().join(",");
  const v = p as Record<string, unknown>;
  return keys === "auto_send,draft_only" && v.draft_only === true && v.auto_send === false;
}
