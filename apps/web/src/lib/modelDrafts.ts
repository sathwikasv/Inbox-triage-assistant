// Optional model-assisted draft variants, generated offline by ml/ollama_drafts.py and keyed by thread_key.
// The app never calls a model at runtime. When the file is absent, the template fallback is used and labelled.

export interface ModelVariant {
  body: string;
  source: string; // e.g. "ollama-llama3.1-8b"
}

const files = import.meta.glob("../../../../ml/outputs/draft_variants.json", { eager: true, import: "default" });
const raw = Object.values(files)[0] as Record<string, unknown> | undefined;

function normalize(v: unknown): ModelVariant[] {
  const list = Array.isArray(v) ? v : v && typeof v === "object" && Array.isArray((v as { variants?: unknown }).variants) ? (v as { variants: unknown[] }).variants : v ? [v] : [];
  return list
    .map((x) => (typeof x === "string" ? { body: x, source: "model" } : (x as Partial<ModelVariant & { text: string }>)))
    .map((x) => ({ body: String(x.body ?? x.text ?? ""), source: String(x.source ?? "model") }))
    .filter((x) => x.body.trim().length > 0);
}

export const MODEL_VARIANTS: Record<string, ModelVariant[]> = Object.fromEntries(Object.entries(raw ?? {}).map(([k, v]) => [k, normalize(v)]));
export const MODEL_AVAILABLE = Object.values(MODEL_VARIANTS).some((v) => v.length > 0);
