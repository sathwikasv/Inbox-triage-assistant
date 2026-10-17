import { Schema, model } from "mongoose";

const DecisionSchema = new Schema(
  {
    runId: { type: Schema.Types.ObjectId, ref: "TriageRun", required: true },
    emailId: { type: String, required: true },
    threadKey: { type: String, required: true },
    purpose: { type: String, required: true },
    urgency: { type: String, required: true },
    actionNeeded: { type: Boolean, required: true },
    status: { type: String, required: true },
    duplicateOf: { type: String, default: null },
    facts: { type: [Schema.Types.Mixed], default: [] }, // each with { email_id, quote } evidence
    quarantined: { type: Boolean, default: false, immutable: true },
    reviewerEdited: { type: Boolean, default: false },
    edits: { type: Schema.Types.Mixed, default: {} }, // reviewer patch: purpose / urgency / action_needed / status only
  },
  { timestamps: true, collection: "decisions", minimize: false },
);
DecisionSchema.index({ runId: 1, emailId: 1 }, { unique: true });

export const Decision = model("Decision", DecisionSchema);
