import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { mailer } from "../src/services/mailer.js";

let mongo: MongoMemoryServer;
let server: Server;
let base: string;
const realSend = mailer.send;

async function call(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const setCookie = res.headers.get("set-cookie") ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test responses are inspected loosely
  const json = (await res.json()) as Record<string, any>;
  return { status: res.status, json, setCookie, cookie: setCookie.split(";")[0] };
}
const signup = (over: Record<string, unknown> = {}) => call("POST", "/auth/signup", { name: "Riya Sharma", email: "Riya@Example.com", password: "inbox2026", ...over });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);
afterAll(async () => {
  server?.close();
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => {
  await User.deleteMany({});
});
afterEach(() => {
  mailer.send = realSend;
  delete process.env.SMTP_URL;
});

describe("sign up and sign in", () => {
  it("creates an account, signs the person in with an httpOnly cookie, and never returns the password hash", async () => {
    const r = await signup();
    expect(r.status).toBe(201);
    expect(r.json.user).toMatchObject({ email: "riya@example.com", name: "Riya Sharma", onboarding_completed: false });
    expect(JSON.stringify(r.json)).not.toMatch(/password_hash|scrypt/);
    expect(r.setCookie).toMatch(/td_auth=.+HttpOnly/);
    const me = await call("GET", "/auth/me", undefined, r.cookie);
    expect(me.json.user.email).toBe("riya@example.com");
    const stored = await User.findOne({ email: "riya@example.com" }).lean();
    expect(stored!.password_hash).toMatch(/^scrypt\$/);
    expect(stored!.password_hash).not.toContain("inbox2026");
  });

  it("refuses a second account with the same email and weak passwords", async () => {
    await signup();
    expect((await signup()).status).toBe(409);
    expect((await signup({ email: "a@b.co", password: "short1" })).json.error).toMatch(/at least 8/);
    expect((await signup({ email: "a@b.co", password: "onlyletters" })).json.error).toMatch(/letters and numbers/);
    expect((await signup({ email: "not-an-email" })).status).toBe(400);
  });

  it("signs in with the right password and gives one answer for a wrong password or unknown email", async () => {
    await signup();
    const ok = await call("POST", "/auth/login", { email: "riya@example.com", password: "inbox2026" });
    expect(ok.status).toBe(200);
    expect(ok.setCookie).toMatch(/td_auth=/);
    const wrong = await call("POST", "/auth/login", { email: "riya@example.com", password: "nope12345" });
    const unknown = await call("POST", "/auth/login", { email: "nobody@example.com", password: "nope12345" });
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(wrong.json.error).toBe(unknown.json.error);
  });

  it("locks the account for a while after five wrong passwords", async () => {
    await signup();
    for (let i = 0; i < 5; i++) await call("POST", "/auth/login", { email: "riya@example.com", password: "wrong1234" });
    const locked = await call("POST", "/auth/login", { email: "riya@example.com", password: "inbox2026" });
    expect(locked.status).toBe(429);
    expect(locked.json.error).toMatch(/Try again in 15 minutes/);
  });

  it("rejects a tampered cookie, and signing out clears it", async () => {
    const r = await signup();
    expect((await call("GET", "/auth/me", undefined, r.cookie.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).status).toBe(401);
    const out = await call("POST", "/auth/logout", {}, r.cookie);
    expect(out.setCookie).toMatch(/td_auth=;.*Max-Age=0/);
  });

  it("records onboarding and profile changes for the signed-in person only", async () => {
    const r = await signup();
    const p = await call("PATCH", "/auth/me", { onboarding_completed: true, timezone: "Europe/London" }, r.cookie);
    expect(p.json.user).toMatchObject({ onboarding_completed: true, timezone: "Europe/London" });
    expect((await call("PATCH", "/auth/me", { onboarding_completed: true })).status).toBe(401);
    expect((await call("PATCH", "/auth/me", { email: "x@y.z" }, r.cookie)).status).toBe(400);
  });
});

describe("password reset", () => {
  it("says honestly when reset emails are not set up", async () => {
    const r = await call("POST", "/auth/forgot", { email: "riya@example.com" });
    expect(r.status).toBe(503);
    expect(r.json.error).toMatch(/not set up/);
  });

  it("emails a one-hour link, resets the password and signs out other devices", async () => {
    const sent: { to: string; text: string }[] = [];
    process.env.SMTP_URL = "smtp://test";
    mailer.send = async (to, _subject, text) => void sent.push({ to, text });
    const first = await signup();
    const forgot = await call("POST", "/auth/forgot", { email: "riya@example.com" });
    expect(forgot.status).toBe(200);
    expect(sent).toHaveLength(1);
    const token = /reset\?token=([\w-]+)/.exec(sent[0].text)![1];
    expect((await call("POST", "/auth/reset", { token, password: "weak" })).status).toBe(400);
    const reset = await call("POST", "/auth/reset", { token, password: "newInbox2027" });
    expect(reset.status).toBe(200);
    expect((await call("GET", "/auth/me", undefined, first.cookie)).status).toBe(401);
    expect((await call("POST", "/auth/reset", { token, password: "another2028" })).status).toBe(400);
    expect((await call("POST", "/auth/login", { email: "riya@example.com", password: "newInbox2027" })).status).toBe(200);
  });

  it("answers the same for an unknown email and sends nothing", async () => {
    const sent: string[] = [];
    process.env.SMTP_URL = "smtp://test";
    mailer.send = async (to) => void sent.push(to);
    const r = await call("POST", "/auth/forgot", { email: "nobody@example.com" });
    expect(r.status).toBe(200);
    expect(r.json.message).toMatch(/If an account exists/);
    expect(sent).toEqual([]);
  });
});
