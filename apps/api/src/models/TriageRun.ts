import { Schema, model } from "mongoose";

const TriageRunSchema = new Schema(
  {
    fixtureHash: { type: String, required: true, unique: true, index: true },
    caseId: { type: String, required: true },
    policy: {
      draftOnly: { type: Boolean, default: true, immutable: true },
      autoSend: { type: Boolean, default: false, immutable: true },
    },
    reviewed: { type: Boolean, default: false },
    metrics: { type: Schema.Types.Mixed },
  },
  { timestamps: true, collection: "triage_runs" }
);

export const TriageRun = model("TriageRun", TriageRunSchema);
