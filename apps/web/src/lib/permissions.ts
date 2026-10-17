import type { Role } from "../repo";

export const ROLES: Record<Role, { label: string; description: string }> = {
  viewer: { label: "Viewer", description: "Reads the triage and its evidence. Cannot change anything." },
  reviewer: { label: "Reviewer", description: "Corrects decisions, edits drafts, records escalations and previews actions." },
  approver: { label: "Approver", description: "Everything a Reviewer can do, plus signs off drafts before they leave the team." },
};

export type Permission = "view" | "edit_decision" | "edit_draft" | "preview" | "escalate" | "approve_draft" | "handoff" | "apply_labels" | "send";

/** The permission matrix shown in Settings and enforced in the UI. Nobody can send: the policy is draft-only. */
export const PERMISSIONS: { id: Permission; label: string; roles: Role[]; note?: string }[] = [
  { id: "view", label: "View triage, facts and evidence", roles: ["viewer", "reviewer", "approver"] },
  { id: "edit_decision", label: "Correct type, urgency and status", roles: ["reviewer", "approver"] },
  { id: "edit_draft", label: "Edit and save reply drafts", roles: ["reviewer", "approver"] },
  { id: "preview", label: "Preview labels and archive", roles: ["reviewer", "approver"] },
  { id: "escalate", label: "Record escalations and watch items", roles: ["reviewer", "approver"] },
  { id: "approve_draft", label: "Approve drafts that state dates or commitments", roles: ["approver"] },
  { id: "handoff", label: "Copy or download a reviewed reply (.eml draft)", roles: ["reviewer", "approver"], note: "only after the lint passes and, for dates, commitments or escalations, an Approver signs off" },
  { id: "apply_labels", label: "Apply labels or archive in a mailbox", roles: [], note: "not in the MVP: label and archive are previews only" },
  { id: "send", label: "Send email", roles: [], note: "disabled by policy: draft_only = true, auto_send = false" },
];

export const can = (role: Role, p: Permission) => PERMISSIONS.find((x) => x.id === p)!.roles.includes(role);
