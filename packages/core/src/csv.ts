import { FixtureError } from "./schema.js";
import { POLICY } from "./policy.js";

/** Columns of an inbox CSV. Same fields as the JSON fixture; the policy is never read from a file. */
export const CSV_COLUMNS = ["email_id", "subject", "body", "received_at", "expected_action"] as const;
const REQUIRED = ["email_id", "subject", "body", "received_at"];

/** RFC 4180 rows: quoted fields may hold commas, quotes ("") and line breaks. */
function rows(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      out.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new FixtureError([{ path: "(file)", message: "a quoted field is never closed" }]);
  if (field !== "" || row.length) {
    row.push(field);
    out.push(row);
  }
  return out.filter((r) => r.some((x) => x.trim() !== ""));
}

export const looksLikeCsv = (text: string) => /^﻿?\s*"?email_id"?\s*,/i.test(text);

/** Turns inbox CSV text into the fixture shape, with row-numbered errors for anything malformed. */
export function fixtureFromCsv(text: string) {
  const all = rows(text.replace(/^﻿/, ""));
  if (!all.length) throw new FixtureError([{ path: "(file)", message: "the CSV is empty" }]);
  const header = all[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) throw new FixtureError(missing.map((c) => ({ path: "header", message: `missing column "${c}"` })));
  const idx = (c: string) => header.indexOf(c);
  const issues: { path: string; message: string }[] = [];
  const emails = all.slice(1).map((cells, i) => {
    const line = i + 2;
    if (cells.length !== header.length) issues.push({ path: `row ${line}`, message: `has ${cells.length} fields, the header has ${header.length}` });
    const get = (c: string) => (idx(c) >= 0 ? (cells[idx(c)] ?? "").trim() : "");
    const at = get("received_at");
    return {
      email_id: get("email_id"),
      subject: get("subject"),
      body: get("body"),
      received_at: at === "" || at.toLowerCase() === "null" ? null : at, // blank means unknown, as in the JSON fixture
      ...(get("expected_action") ? { expected_action: get("expected_action") } : {}),
    };
  });
  if (!emails.length) issues.push({ path: "(file)", message: "no email rows under the header" });
  if (issues.length) throw new FixtureError(issues);
  return { case_id: "C16" as const, records: { emails, policy: { ...POLICY } } };
}

/** Raw file text (JSON or CSV) or an already parsed object → the fixture object that gets validated and hashed. */
export function loadInput(input: unknown): unknown {
  if (typeof input !== "string") return input;
  if (looksLikeCsv(input)) return fixtureFromCsv(input);
  try {
    return JSON.parse(input);
  } catch (e) {
    throw new FixtureError([{ path: "(file)", message: `not valid JSON or CSV (${(e as Error).message})` }]);
  }
}

/** One CSV per inbox, ready to open in a spreadsheet. */
export function fixtureToCsv(emails: { email_id: string; subject: string; body: string; received_at: string | null; expected_action?: string }[]): string {
  const q = (v: string | null | undefined) => (v === null || v === undefined ? "" : /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [CSV_COLUMNS.join(","), ...emails.map((e) => [e.email_id, e.subject, e.body, e.received_at, e.expected_action].map(q).join(","))].join("\n") + "\n";
}
