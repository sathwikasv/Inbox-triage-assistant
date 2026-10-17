/** Tracker ids such as ABC-101 or OPS-7. */
const ISSUE_ID = /\b[A-Z][A-Z0-9]{1,9}-\d{1,6}\b/g;

export function extractReferences(text: string): string[] {
  return [...new Set(text.match(ISSUE_ID) ?? [])];
}

/** "already tracks this incident" — the item exists elsewhere; do not open a new ticket. */
export const ALREADY_TRACKED = /\balready (?:tracks?|tracked|logged|raised)\b[^.;]*/i;

/** Words that point back at an earlier message instead of naming the topic. */
export interface Anaphora {
  blocker: boolean; // "the earlier blocker"
  same_request: boolean; // "the same ... request above"
  this_item: boolean; // "this incident", "this issue"
}

export function extractAnaphora(text: string): Anaphora {
  return {
    blocker: /\b(earlier|previous|that|the)\s+blocker\b/i.test(text),
    same_request: /\bsame\b[^.?!]*\b(request|issue|ticket)\b/i.test(text),
    this_item: /\bthis (incident|issue|problem|bug|request)\b/i.test(text),
  };
}
