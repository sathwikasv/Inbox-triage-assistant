import type { Policy } from "./types.js";
// Immutable by construction. Nothing in core, api or web may produce auto_send: true.
export const POLICY: Policy = Object.freeze({ draft_only: true, auto_send: false } as const);
