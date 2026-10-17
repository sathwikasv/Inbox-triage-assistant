import { Schema, model } from "mongoose";

export const AUDIT_TYPES = ["import", "reimport", "edit_draft", "edit_decision", "preview_label", "preview_archive", "save", "quarantine"] as const;

const AuditEventSchema = new Schema(
  {
    runId: { type: Schema.Types.ObjectId, ref: "TriageRun", required: true, index: true },
    at: { type: Date, default: () => new Date() },
    actor: { type: String, default: "reviewer" },
    type: { type: String, enum: AUDIT_TYPES, required: true },
    emailId: { type: String, default: null },
    threadKey: { type: String, default: null },
    detail: { type: String, default: "" },
  },
  { collection: "audit_events" },
);

export const AuditEvent = model("AuditEvent", AuditEventSchema);
