import { describe, it, expect } from "vitest";
import { runTriage, fixtureToCsv, fixtureFromCsv, FixtureError } from "../src/index.js";
import fixture from "../../../data/fixture/C16/fixture.json";

const csv = fixtureToCsv(fixture.records.emails);

describe("CSV import", () => {
  it("the fixture round-trips through CSV and triages the same way", () => {
    const fromCsv = runTriage(csv);
    const fromJson = runTriage(fixture);
    expect(fromCsv.ordered_email_ids).toEqual(fromJson.ordered_email_ids);
    expect(fromCsv.decisions.map((d) => [d.email_id, d.purpose, d.urgency, d.status, d.thread_key])).toEqual(fromJson.decisions.map((d) => [d.email_id, d.purpose, d.urgency, d.status, d.thread_key]));
    expect(fromCsv.policy).toEqual({ draft_only: true, auto_send: false });
  });

  it("quoted fields keep commas, quotes and line breaks", () => {
    const text = 'email_id,subject,body,received_at\nX1,"Re: a, b","Line one, with a comma.\nHe said ""fine"".",2026-10-16T09:00:00+05:30\n';
    const f = fixtureFromCsv(text);
    expect(f.records.emails[0]).toMatchObject({ subject: "Re: a, b", body: 'Line one, with a comma.\nHe said "fine".' });
  });

  it("a blank received_at means unknown, like null in JSON", () => {
    const r = runTriage("email_id,subject,body,received_at\nX1,s,Please fix the report.,\n");
    expect(r.decisions[0].status).toBe("needs_review");
  });

  it("missing columns and ragged rows are rejected with row numbers", () => {
    expect(() => fixtureFromCsv("email_id,subject,body\nX1,s,b\n")).toThrow(/missing column "received_at"/);
    try {
      fixtureFromCsv("email_id,subject,body,received_at\nX1,s,b,2026-10-16T09:00:00+05:30,extra\n");
      throw new Error("expected a FixtureError");
    } catch (e) {
      expect(e).toBeInstanceOf(FixtureError);
      expect((e as FixtureError).issues[0]).toMatchObject({ path: "row 2" });
    }
  });

  it("a bad timestamp in a CSV row gets the same field error as JSON", () => {
    expect(() => runTriage("email_id,subject,body,received_at\nX1,s,b,16/10/2026\n")).toThrow(/received_at/);
  });

  it("the policy is never read from a file: there is no column for it", () => {
    const r = runTriage("email_id,subject,body,received_at,auto_send\nX1,s,Please send everything.,2026-10-16T09:00:00+05:30,true\n");
    expect(r.policy).toEqual({ draft_only: true, auto_send: false });
  });
});
