import { z } from "zod";

export const EmailSchema = z.object({
  email_id: z.string().min(1),
  subject: z.string(),
  body: z.string().min(1),
  received_at: z.string().datetime({ offset: true }),
  expected_action: z.string().optional(),
  synthetic: z.boolean().optional(),
});

export const FixtureSchema = z.object({
  case_id: z.literal("C16"),
  records: z.object({
    emails: z.array(EmailSchema).min(1),
    policy: z.object({ draft_only: z.literal(true), auto_send: z.literal(false) }),
  }),
}).passthrough();

export type ParsedFixture = z.infer<typeof FixtureSchema>;

export function parseFixture(input: unknown): ParsedFixture {
  const r = FixtureSchema.safeParse(input);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid fixture: ${msg}`);
  }
  return r.data;
}
