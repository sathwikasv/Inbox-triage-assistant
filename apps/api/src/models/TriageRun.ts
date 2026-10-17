import { Schema, model } from "mongoose";

const TriageRunSchema = new Schema(
  {
    fixtureHash: { type: String, required: true, unique: true, index: true },
    caseId: { type: String, required: true },
    source: { type: String, default: "upload" },
    // Set once at import; immutable at the schema level and never exposed to any update route.
    policy: {
      draftOnly: { type: Boolean, default: true, immutable: true },
      autoSend: { type: Boolean, default: false, immutable: true },
    },
    labelsApplied: { type: Boolean, default: false },
    ai: { type: Schema.Types.Mixed, default: { status: "disabled" } }, // { status, model, error?, ms } of the optional Gemini pass
    result: { type: Schema.Types.Mixed, required: true }, // TriageResult snapshot from packages/core
    reviewed: { type: Boolean, default: false },
    savedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "triage_runs", minimize: false },
);

export const TriageRun = model("TriageRun", TriageRunSchema);
