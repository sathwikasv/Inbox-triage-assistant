export type OwnerMention =
  | { kind: "named"; owner: string; quote: string }
  | { kind: "unowned"; owner: null; quote: string };

// Case-sensitive capture on purpose: "Owner Dev" names someone, "no confirmed owner yet" does not.
const NAMED = [
  /\b[Oo]wner(?:\s+is)?\s*[:-]?\s+([A-Z][A-Za-z.'-]+)/,
  /\b[Aa]ssigned to\s+([A-Z][A-Za-z.'-]+)/,
  /\b([A-Z][a-z]+)\s+(?:owns|will own|is the owner)\b/,
];
const UNOWNED = /\bno (?:confirmed |clear |assigned |named )?owner\b|\bunassigned\b|\bowner (?:is )?(?:unknown|tbd|tbc|not (?:yet )?confirmed)\b/i;

export function extractOwner(text: string): OwnerMention | null {
  const u = UNOWNED.exec(text);
  if (u) return { kind: "unowned", owner: null, quote: u[0] };
  for (const re of NAMED) {
    const m = re.exec(text);
    if (m) return { kind: "named", owner: m[1].replace(/[.']+$/, ""), quote: m[0] };
  }
  return null;
}
