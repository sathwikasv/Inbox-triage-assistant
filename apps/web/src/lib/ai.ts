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
