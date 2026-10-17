import type { Role } from "@c16/core";

export const ROLES: Record<Role, { label: string; description: string }> = {
  viewer: { label: "Viewer", description: "Reads mail, tasks and the calendar. Cannot change or send anything." },
  reviewer: { label: "Reviewer", description: "Triages mail, drafts replies, manages tasks and the calendar, and sends routine replies." },
  approver: { label: "Approver", description: "Everything a Reviewer can do, plus signs off replies with dates or commitments." },
};

export const PERMISSIONS: { id: string; label: string; roles: Role[] }[] = [
  { id: "read", label: "Read mail, tasks and calendar", roles: ["viewer", "reviewer", "approver"] },
  { id: "triage", label: "Change categories, star, archive", roles: ["reviewer", "approver"] },
  { id: "tasks", label: "Add and update tasks, accept meetings", roles: ["reviewer", "approver"] },
  { id: "draft", label: "Write and save reply drafts", roles: ["reviewer", "approver"] },
  { id: "send", label: "Send routine replies after confirming", roles: ["reviewer", "approver"] },
  { id: "approve", label: "Approve replies with dates or commitments", roles: ["approver"] },
  { id: "auto", label: "Send without a person's confirmation", roles: [] },
];
