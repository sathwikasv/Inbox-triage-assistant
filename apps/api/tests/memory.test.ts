import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { ThreadMemory } from "../src/models/ThreadMemory.js";
import { aiClient } from "../src/services/ai.js";

// The assistant's memory: it reads only new messages, with what it learned before and related conversations.
let mongo: MongoMemoryServer;
let server: Server;
let base: string;
const realAi = aiClient.fetch;
let prompts: string[] = [];

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), ThreadMemory.init()]);
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);
afterAll(async () => {
  server?.close();
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), ThreadMemory.deleteMany({})]);
  process.env.GEMINI_API_KEY = "k";
  prompts = [];
  aiClient.fetch = async (_url, init) => {
    const body = JSON.parse(String(init.body));
    prompts.push(body.contents[0].parts[0].text);
    const out = {
      summary: "Karan wants the Q3 budget numbers.",
      key_points: ["Q3 numbers by Friday"],
      needs_reply: true,
      reply: "Hi Karan,\n\nI will check the numbers.\n\nRiya",
      review_needed: false,
      review_reasons: [],
      category: "requires_action",
      category_reason: "Karan asks for numbers",
      automated: false,
      memory: { summary: `Karan asked for the Q3 budget numbers (${prompts.length} reads).`, facts: ["Budget owner: Karan Desai"], tasks: [{ text: "Send the final Q3 budget numbers", owner: "Riya", due: "Friday", done: false }], decisions: [], open_questions: ["Which format does Karan need?"] },
      related_used: [],
    };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }), { status: 200 });
  };
});
afterEach(() => {
  aiClient.fetch = realAi;
  delete process.env.GEMINI_API_KEY;
});

async function signIn() {
  const r = await fetch(`${base}/auth/signup`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Riya", email: "riya@example.com", password: "inbox2026" }) });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
const m1 = { id: "a1", from: "Karan Desai", direction: "inbound", received_at: "2026-10-14T10:00:00+05:30", body: "Hi Riya, could you share the final Q3 budget numbers?" };
const m2 = { id: "a2", from: "Karan Desai", direction: "inbound", received_at: "2026-10-16T09:00:00+05:30", body: "Following up: I need them by Friday for the board deck." };
const assist = (cookie: string, messages: object[], extra: object = {}) =>
  fetch(`${base}/ai/assist`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ subject: "Q3 numbers", user_name: "Riya", thread_key: "gmail:riya:T-q3", participants: ["karan@example.com"], messages, ...extra }) }).then((r) => r.json());

describe("assistant memory", () => {
  it("saves what it learned about a conversation for the signed-in person", async () => {
    const cookie = await signIn();
    const r = await assist(cookie, [m1]);
    expect(r.memory_saved).toBe(true);
    const mem = await ThreadMemory.findOne({ thread_key: "gmail:riya:T-q3" }).lean();
    expect(mem).toMatchObject({ subject: "Q3 numbers", participants: ["karan@example.com"], messages_read: 1, last_message_id: "a1" });
    expect(mem!.tasks[0]).toMatchObject({ text: "Send the final Q3 budget numbers", owner: "Riya", due: "Friday" });
    expect(JSON.stringify(mem)).not.toContain("could you share the final Q3"); // notes, not the email bodies
  });

  it("on a new email reads only the new message, with the earlier notes", async () => {
    const cookie = await signIn();
    await assist(cookie, [m1]);
    const r = await assist(cookie, [m1, m2]);
    const second = prompts[1];
    expect(second).toContain("<earlier_notes about this conversation, from 1 message(s) already read>");
    expect(second).toContain("Send the final Q3 budget numbers (owner: Riya) (due: Friday)");
    expect(second).toContain("Following up: I need them by Friday");
    expect(second).not.toContain("could you share the final Q3 budget numbers?");
    expect(r.memory_used.earlier_messages).toBe(1);
    expect((await ThreadMemory.findOne({}).lean())!.messages_read).toBe(2);
  });

  it("brings in related conversations with the same people", async () => {
    const cookie = await signIn();
    await assist(cookie, [m1]);
    await assist(cookie, [{ ...m2, id: "b1", body: "Separate topic: the vendor invoice." }], { thread_key: "gmail:riya:T-vendor", subject: "Vendor invoice" });
    expect(prompts[1]).toContain("<related_conversations with the same people or topic>");
    expect(prompts[1]).toContain("* Q3 numbers: Karan asked for the Q3 budget numbers");
    expect(prompts[1]).toContain("Still open: Send the final Q3 budget numbers; Which format does Karan need?");
  });

  it("keeps nothing without an account", async () => {
    const r = await assist("", [m1]);
    expect(r.memory_saved).toBe(false);
    expect(await ThreadMemory.countDocuments({})).toBe(0);
  });

  it("lets the person see and erase the memory", async () => {
    const cookie = await signIn();
    await assist(cookie, [m1]);
    const list = await (await fetch(`${base}/ai/memory`, { headers: { cookie } })).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0].user_id).toBeUndefined();
    expect((await fetch(`${base}/ai/memory`)).status).toBe(401);
    const del = await (await fetch(`${base}/ai/memory`, { method: "DELETE", headers: { cookie } })).json();
    expect(del.deleted).toBe(1);
    expect(await ThreadMemory.countDocuments({})).toBe(0);
  });
});
