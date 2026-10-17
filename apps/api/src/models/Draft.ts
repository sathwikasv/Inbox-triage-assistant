import { Schema, model } from "mongoose";

const DraftSchema = new Schema(
  {
    runId: { type: Schema.Types.ObjectId, ref: "TriageRun", required: true },
    threadKey: { type: String, required: true },
    body: { type: String, required: true }, // generated template
    source: { type: String, enum: ["template", "model-assist"], default: "template" },
    lintOk: { type: Boolean, required: true },
    violations: { type: [Schema.Types.Mixed], default: [] },
    editedBody: { type: String, default: null }, // reviewer version; only stored when lint is clean
    editedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null }, // Approver sign-off on the current body; cleared when the draft is edited
    approvedBy: { type: String, default: null },
    // Hand-off: the reviewed reply left the tool for a person to send (copied or downloaded as an unsent .eml).
    handoffAt: { type: Date, default: null },
    handoffHow: { type: String, enum: ["copy", "eml", null], default: null },
    handoffBody: { type: String, default: null },
    repliedAt: { type: Date, default: null }, // a person confirmed they sent it from their own mail app
  },
  { timestamps: true, collection: "drafts" },
);
DraftSchema.index({ runId: 1, threadKey: 1 }, { unique: true });

export const Draft = model("Draft", DraftSchema);
