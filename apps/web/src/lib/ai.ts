import type { Category } from "@c16/core";
import { setting } from "./providers";

// AI reply drafts come from the server (the model key never reaches the browser). The server checks every
// draft against the conversation's facts and rejects one that invents claims; the app never shows those.

export interface AiReplyRequest {
  subject: string;
  tone: "standard" | "formal" | "friendly" | "brief";
  user_name: string;
  messages: { from: string; direction: "inbound" | "outbound"; received_at: string; body: string }[];
}

const base = () => setting("api").replace(/\/$/, "");

export async function aiStatus(): Promise<{ enabled: boolean; model: string | null }> {
  if (!base()) return { enabled: false, model: null };
  try {
    const r = await fetch(`${base()}/ai/status`);
    return r.ok ? r.json() : { enabled: false, model: null };
  } catch {
    return { enabled: false, model: null };
  }
}

export async function aiReply(req: AiReplyRequest): Promise<{ ok: true; body: string; model: string } | { ok: false; error: string }> {
  try {
    const r = await fetch(`${base()}/ai/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
    const j = (await r.json().catch(() => ({}))) as { status?: string; body?: string; model?: string; error?: string; violations?: { term: string }[] };
    if (r.ok && j.body) return { ok: true, body: j.body, model: j.model ?? "AI" };
    if (j.status === "rejected") return { ok: false, error: `the AI draft made claims the conversation does not support (${(j.violations ?? []).map((v) => v.term).join(", ")}), so it was discarded` };
    return { ok: false, error: j.error ?? `AI service ${r.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface ReviewReason {
  text: string;
  source: "ai" | "rules";
}
export interface AssistRequest {
  subject: string;
  user_name: string;
  category?: string;
  messages: AiReplyRequest["messages"];
}
export interface AssistResult {
  status: "ok";
  model: string;
  summary: string;
  key_points: string[];
  needs_reply: boolean;
  reply: string | null; // already checked by the server's claims check; null when withheld or not needed
  reply_status: "ok" | "rejected" | "none";
  review: { needed: boolean; reasons: ReviewReason[] };
  category?: Category | null; // the model's opinion, applied as an AI decision (a person's choice still wins)
  category_reason?: string | null;
  automated?: boolean;
}

/** Whether the server answers, and whether it has a model key. */
export async function assistantStatus(): Promise<{ server: "none" | "down" | "ok"; enabled: boolean; model: string | null }> {
  if (!base()) return { server: "none", enabled: false, model: null };
  try {
    const r = await fetch(`${base()}/ai/status`);
    if (!r.ok) return { server: "down", enabled: false, model: null };
    const j = (await r.json()) as { enabled: boolean; model: string | null };
    return { server: "ok", ...j };
  } catch {
    return { server: "down", enabled: false, model: null };
  }
}

export async function aiAssist(req: AssistRequest): Promise<AssistResult | { status: "error"; error: string }> {
  try {
    const r = await fetch(`${base()}/ai/assist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
    const j = (await r.json().catch(() => ({}))) as AssistResult & { error?: string };
    if (r.ok && j.status === "ok") return j;
    return { status: "error", error: j.error ?? `assistant ${r.status}` };
  } catch (e) {
    return { status: "error", error: (e as Error).message };
  }
}
