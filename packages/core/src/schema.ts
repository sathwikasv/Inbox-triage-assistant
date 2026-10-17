import { z } from "zod";

export const EmailSchema = z.object({
  email_id: z.string().min(1),
  subject: z.string(),
  body: z.string().min(1),
  // Required key. null is allowed and means "unknown" (fixture rule: null means unknown, never zero).
  received_at: z.string().datetime({ offset: true }).nullable(),
  expected_action: z.string().optional(),
  synthetic: z.boolean().optional(),
  thread_id: z.string().min(1).optional(),
});

export const FixtureSchema = z
  .object({
    case_id: z.literal("C16"),
    records: z.object({
      emails: z.array(EmailSchema).min(1),
      policy: z.object({ draft_only: z.literal(true), auto_send: z.literal(false) }),
    }),
  })
  .passthrough();

export type ParsedFixture = z.infer<typeof FixtureSchema>;

export class FixtureError extends Error {
  constructor(public readonly issues: { path: string; message: string }[]) {
    super(`Invalid fixture: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
    this.name = "FixtureError";
  }
}

/** Turns zod paths like records.emails.5.received_at into "records.emails[5] (E06).received_at". */
function describePath(path: (string | number)[], input: unknown): string {
  const out: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (typeof p === "number") {
      const prev = path.slice(0, i).join(".");
      let id = "";
      if (prev === "records.emails") {
        const e = (input as { records?: { emails?: { email_id?: unknown }[] } })?.records?.emails?.[p];
        if (e && typeof e.email_id === "string") id = ` (${e.email_id})`;
      }
      out[out.length - 1] += `[${p}]${id}`;
    } else out.push(p);
  }
  return out.join(".");
}

export function parseFixture(input: unknown): ParsedFixture {
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch (e) {
      throw new FixtureError([{ path: "(file)", message: `not valid JSON (${(e as Error).message})` }]);
    }
  }
  const r = FixtureSchema.safeParse(input);
  if (!r.success) {
    throw new FixtureError(r.error.issues.map((i) => ({ path: describePath(i.path, input), message: i.message })));
  }
  return r.data;
}
