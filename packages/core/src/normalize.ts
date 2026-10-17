import type { RawEmail } from "./types.js";

/** Sort by received_at ascending, tie-break by email_id. Fixture order is NOT chronological. */
export function sortEmails(emails: RawEmail[]): RawEmail[] {
  return [...emails].sort((a, b) => {
    const t = Date.parse(a.received_at) - Date.parse(b.received_at);
    return t !== 0 ? t : a.email_id.localeCompare(b.email_id);
  });
}
