import { describe, it, expect } from "vitest";
import { runTriage } from "../src/index.js";
import fixture from "../../../data/fixture/C16/fixture.json";
import { fixtureWith } from "./helpers.js";

const threadOf = (r: ReturnType<typeof runTriage>, id: string) =>
  r.threads.find((t) => t.thread_key === r.decisions.find((d) => d.email_id === id)!.thread_key)!;

describe("resolutions close items and suppress chasers", () => {
  const r = runTriage(fixture);

  it("E03 closes the export and asks not to chase: no draft", () => {
    const t = threadOf(r, "E03");
    expect(t.status).toBe("closed");
    expect(t.suppress_chaser).toBe(true);
    expect(t.draft_mode).toBe("none");
    expect(t.action_needed).toBe(false);
  });

  it("E11 'almost done' alone stays in progress; it is not completion", () => {
    const only = runTriage(fixtureWith({ remove: ["E03"] }));
    const d = only.decisions.find((d) => d.email_id === "E11")!;
    expect(d.purpose).toBe("status_update");
    expect(d.status).toBe("in_progress");
  });

  it("E08 resolves the E07 blocker; the attachment is claimed but unverified", () => {
    const t = threadOf(r, "E08");
    expect(t.email_ids).toEqual(["E07", "E08"]);
    expect(t.status).toBe("closed");
    expect(t.attachment_claimed).toBe(true);
    expect(t.attachment_verified).toBe(false);
    expect(t.draft_mode).toBe("ack");
  });

  it("changed input: if E08 is removed the pilot stays blocked and needs action", () => {
    const t = threadOf(runTriage(fixtureWith({ remove: ["E08"] })), "E07");
    expect(t.status).toBe("blocked");
    expect(t.action_needed).toBe(true);
  });

  it("an FYI that quotes an old deadline creates no action and no due date", () => {
    const fyi = "FYI, forwarding the old thread for context.\n> Please fix duplicate ticket creation. Due 18 October.";
    const r2 = runTriage(fixtureWith({ add: [{ email_id: "E13", body: fyi }] }));
    const d = r2.decisions.find((d) => d.email_id === "E13")!;
    expect(d.purpose).toBe("fyi");
    expect(d.action_needed).toBe(false);
    expect(d.facts.filter((f) => f.kind === "due")).toEqual([]);
    expect(threadOf(r2, "E01").latest_due).toBe("2026-10-20");
  });
});
