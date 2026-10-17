import fixture from "../../../data/fixture/C16/fixture.json";

type Email = (typeof fixture.records.emails)[number];

/** A copy of the starter fixture with some emails changed, added or removed. */
export function fixtureWith(change: { replace?: Record<string, Partial<Email>>; add?: Partial<Email>[]; remove?: string[] }) {
  const f = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
  f.records.emails = f.records.emails
    .filter((e) => !change.remove?.includes(e.email_id))
    .map((e) => ({ ...e, ...(change.replace?.[e.email_id] ?? {}) }));
  for (const a of change.add ?? []) f.records.emails.push({ subject: "Pilot incident", expected_action: "human review", received_at: "2026-10-16T18:00:00+05:30", body: "", email_id: "X", ...a } as Email);
  return f;
}
