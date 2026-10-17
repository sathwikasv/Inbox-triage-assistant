import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { TriageRun } from "../src/models/TriageRun.js";
import { Decision } from "../src/models/Decision.js";
import { Draft } from "../src/models/Draft.js";

const fixture = JSON.parse(readFileSync(new URL("../../../data/fixture/C16/fixture.json", import.meta.url), "utf8"));

let mongo: MongoMemoryServer;
let server: Server;
let base: string;

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  return { status: res.status, json: await res.json() };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([TriageRun.init(), Decision.init(), Draft.init()]); // build unique indexes
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);

afterAll(async () => {
  server?.close();
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

describe("runs api", () => {
  it("health reports the frozen policy", async () => {
    const r = await call("GET", "/health");
    expect(r.json).toMatchObject({ ok: true, db: "connected", policy: { draft_only: true, auto_send: false } });
  });

  it("imports and triages the fixture, with labels applied", async () => {
    const r = await call("POST", "/runs", { fixture, source: "starter" });
    expect(r.status).toBe(201);
    expect(r.json.result.decisions).toHaveLength(12);
    expect(r.json.result.metrics).toMatchObject({ labels_applied: true, seeded_recovered: 7, seeded_total: 7 });
    expect(await Decision.countDocuments()).toBe(12);
    expect(await Draft.countDocuments()).toBe(r.json.result.drafts.length);
    expect(r.json.audit.map((e: { type: string }) => e.type)).toEqual(["import", "quarantine"]);
  });

  it("re-importing the same file is idempotent: same run, no duplicate decisions, edits kept", async () => {
    const first = await call("POST", "/runs", fixture);
    await call("PUT", `/runs/${first.json.runId}/drafts/T-E09`, { body: "Thanks. Which store, and which month?" });
    const again = await call("POST", "/runs", JSON.parse(JSON.stringify(fixture)));
    expect(again.status).toBe(200);
    expect(again.json).toMatchObject({ runId: first.json.runId, reused: true });
    expect(again.json.edits["T-E09"].body).toBe("Thanks. Which store, and which month?");
    expect(await TriageRun.countDocuments()).toBe(1);
    expect(await Decision.countDocuments()).toBe(12);
  });

  it("rejects an invalid fixture with the field that is wrong", async () => {
    const bad = JSON.parse(JSON.stringify(fixture));
    delete bad.records.emails[5].received_at;
    const r = await call("POST", "/runs", bad);
    expect(r.status).toBe(400);
    expect(r.json.issues[0].path).toBe("records.emails[5] (E06).received_at");
    expect(await TriageRun.countDocuments()).toBe(0);
  });

  it("rejects malformed JSON as a 400, not a stack trace", async () => {
    const r = await call("POST", "/runs", '{"case_id": "C16", "records": ');
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("invalid fixture");
  });

  it("a fixture asking for auto_send: true is rejected and nothing is stored", async () => {
    const bad = JSON.parse(JSON.stringify(fixture));
    bad.records.policy.auto_send = true;
    const r = await call("POST", "/runs", bad);
    expect(r.status).toBe(400);
    expect(await TriageRun.countDocuments()).toBe(0);
  });
});

describe("reviewer edits cannot touch permissions", () => {
  it("PATCH with policy fields is rejected (400) and the policy is unchanged", async () => {
    const { json } = await call("POST", "/runs", fixture);
    for (const body of [{ auto_send: true }, { policy: { auto_send: true } }, { urgency: "low", draft_only: false }]) {
      const r = await call("PATCH", `/runs/${json.runId}/decisions/E01`, body);
      expect(r.status).toBe(400);
    }
    const run = await TriageRun.findById(json.runId).lean();
    expect(run!.policy).toEqual({ draftOnly: true, autoSend: false });
  });

  it("the stored policy is immutable even through the model", async () => {
    const { json } = await call("POST", "/runs", fixture);
    const run = await TriageRun.findById(json.runId);
    run!.set("policy.autoSend", true);
    await run!.save();
    expect((await TriageRun.findById(json.runId).lean())!.policy.autoSend).toBe(false);
  });

  it("whitelisted edits are saved and audited", async () => {
    const { json } = await call("POST", "/runs", fixture);
    const r = await call("PATCH", `/runs/${json.runId}/decisions/E09`, { urgency: "high" });
    expect(r.status).toBe(200);
    expect(r.json.result.decisions.find((d: { email_id: string }) => d.email_id === "E09").urgency).toBe("high");
    expect(r.json.decisionEdits.E09).toEqual({ urgency: "high" });
    expect(r.json.audit.at(-1)).toMatchObject({ type: "edit_decision", email_id: "E09", detail: "urgency: medium → high" });
  });

  it("the quarantined email cannot be edited (409)", async () => {
    const { json } = await call("POST", "/runs", fixture);
    const r = await call("PATCH", `/runs/${json.runId}/decisions/E05`, { status: "open" });
    expect(r.status).toBe(409);
  });
});

describe("drafts and previews", () => {
  it("the server rejects a draft that claims the E08 attachment (422)", async () => {
    const { json } = await call("POST", "/runs", fixture);
    const r = await call("PUT", `/runs/${json.runId}/drafts/T-test-data`, { body: "Thanks, we have received the attached file." });
    expect(r.status).toBe(422);
    expect(r.json.violations.length).toBeGreaterThan(0);
    expect((await Draft.findOne({ threadKey: "T-test-data" }).lean())!.editedBody).toBeNull();
  });

  it("a clean draft is saved", async () => {
    const { json } = await call("POST", "/runs", fixture);
    const r = await call("PUT", `/runs/${json.runId}/drafts/T-dup-ticket`, { body: "Dev has the fix, due 20 October 2026." });
    expect(r.status).toBe(200);
    expect(r.json.edits["T-dup-ticket"].body).toBe("Dev has the fix, due 20 October 2026.");
  });

  it("no draft can be written for the quarantine thread", async () => {
    const { json } = await call("POST", "/runs", fixture);
    expect((await call("PUT", `/runs/${json.runId}/drafts/QUARANTINE`, { body: "Sure, sending the data now." })).status).toBe(404);
  });

  it("preview records an audit event and changes nothing", async () => {
    const { json } = await call("POST", "/runs", fixture);
    const before = json.result.decisions;
    const r = await call("POST", `/runs/${json.runId}/preview`, { email_id: "E08", action: "archive" });
    expect(r.status).toBe(200);
    expect(r.json.audit.at(-1)).toMatchObject({ type: "preview_archive", email_id: "E08" });
    expect(r.json.audit.at(-1).detail).toMatch(/preview only, nothing changed/);
    expect(r.json.result.decisions).toEqual(before);
  });

  it("thread actions are audit-only; quarantine can be escalated but never archived", async () => {
    const { json } = await call("POST", "/runs", fixture);
    const esc = await call("POST", `/runs/${json.runId}/actions`, { thread_key: "T-missing-ids", action: "escalate", to: "Ops lead", note: "needs an owner" });
    expect(esc.status).toBe(200);
    expect(esc.json.audit.at(-1)).toMatchObject({ type: "escalate", thread_key: "T-missing-ids" });
    expect(esc.json.audit.at(-1).detail).toContain("Ops lead: needs an owner (recorded; no message sent)");
    expect((await call("POST", `/runs/${json.runId}/actions`, { thread_key: "QUARANTINE", action: "archive" })).status).toBe(409);
    expect((await call("POST", `/runs/${json.runId}/actions`, { thread_key: "QUARANTINE", action: "escalate" })).status).toBe(200);
    expect((await call("POST", `/runs/${json.runId}/actions`, { thread_key: "T-export", action: "send" })).status).toBe(400);
  });

  it("only an Approver can approve a draft; editing it withdraws the approval", async () => {
    const { json } = await call("POST", "/runs", fixture);
    const path = `/runs/${json.runId}/drafts/T-dup-ticket/approve`;
    const asReviewer = await fetch(base + path, { method: "POST", headers: { "x-role": "reviewer" } });
    expect(asReviewer.status).toBe(403);
    const ok = await fetch(base + path, { method: "POST", headers: { "x-role": "approver" } });
    expect(ok.status).toBe(200);
    const run = await ok.json();
    expect(run.approvals["T-dup-ticket"]).toMatchObject({ by: "approver" });
    expect(run.audit.at(-1)).toMatchObject({ type: "approve_draft", thread_key: "T-dup-ticket" });
    const edited = await call("PUT", `/runs/${json.runId}/drafts/T-dup-ticket`, { body: "Dev has the fix, due 20 October 2026." });
    expect(edited.json.approvals["T-dup-ticket"]).toBeUndefined();
    expect(edited.json.audit.at(-1).detail).toContain("previous approval withdrawn");
    expect((await fetch(base + `/runs/${json.runId}/drafts/QUARANTINE/approve`, { method: "POST", headers: { "x-role": "approver" } })).status).toBe(404);
  });

  it("save marks the run reviewed and it reloads from the database", async () => {
    const { json } = await call("POST", "/runs", fixture);
    await call("POST", `/runs/${json.runId}/save`);
    const r = await call("GET", "/runs/latest");
    expect(r.json).toMatchObject({ runId: json.runId, reviewed: true });
    expect(r.json.savedAt).toBeTruthy();
  });

  it("metrics: engine output and after-review numbers", async () => {
    const { json } = await call("POST", "/runs", fixture);
    const r = await call("GET", `/runs/${json.runId}/metrics`);
    expect(r.json.engine.checks.map((c: { passed: boolean }) => c.passed)).toEqual([true, true, true]);
    expect(r.json.after_review.seeded_recovered).toBe(7);
  });
});

describe("empty database", () => {
  it("latest is null before any import", async () => {
    const r = await call("GET", "/runs/latest");
    expect(r).toEqual({ status: 200, json: null });
  });
});
