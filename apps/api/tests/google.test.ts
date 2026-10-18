import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { googleHttp } from "../src/services/google.js";

let mongo: MongoMemoryServer;
let server: Server;
let base: string;
const realFetch = googleHttp.fetch;

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
  Object.assign(process.env, { GOOGLE_CLIENT_ID: "cid.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REDIRECT_URI: "http://localhost:4000/auth/google/callback", WEB_ORIGIN: "http://localhost:5173" });
});
afterEach(() => {
  googleHttp.fetch = realFetch;
  for (const k of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "WEB_ORIGIN"]) delete process.env[k];
});

/** Google's token and tokeninfo endpoints, faked. */
function fakeGoogle(claims: Record<string, string> = {}) {
  const calls: string[] = [];
  googleHttp.fetch = async (url) => {
    calls.push(String(url));
    if (String(url) === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "ya29.short", expires_in: 3599, refresh_token: "1//refresh", id_token: "idtok", scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly" });
    if (String(url).startsWith("https://oauth2.googleapis.com/tokeninfo")) return Response.json({ aud: "cid.apps.googleusercontent.com", iss: "https://accounts.google.com", sub: "g-123", email: "Riya@Gmail.com", email_verified: "true", name: "Riya Sharma", ...claims });
    return Response.json({}, { status: 404 });
  };
  return calls;
}
const get = (path: string, cookie = "") => fetch(base + path, { redirect: "manual", headers: cookie ? { cookie } : {} });
const cookieOf = (r: Response, name: string) => (r.headers.getSetCookie?.() ?? [r.headers.get("set-cookie") ?? ""]).map((c) => c.split(";")[0]).find((c) => c.startsWith(`${name}=`)) ?? "";

async function signInWithGoogle() {
  const start = await get("/auth/google/start?next=/inbox");
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const cb = await get(`/auth/google/callback?code=abc&state=${state}`, cookieOf(start, "td_gstate"));
  return { start, cb, auth: cookieOf(cb, "td_auth") };
}

describe("Continue with Google", () => {
  it("sends the person to Google with read-only Gmail, offline access and a state", async () => {
    const r = await get("/auth/google/start");
    expect(r.status).toBe(302);
    const url = new URL(r.headers.get("location")!);
    expect(url.host).toBe("accounts.google.com");
    expect(url.searchParams.get("scope")).toBe("openid email profile https://www.googleapis.com/auth/gmail.readonly");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(cookieOf(r, "td_gstate")).not.toContain(url.searchParams.get("state")!); // the state cookie is encrypted
  });

  it("creates the account, signs in, links Gmail and lands on the page asked for; tokens never reach the browser", async () => {
    fakeGoogle();
    const { cb, auth } = await signInWithGoogle();
    expect(cb.status).toBe(302);
    expect(cb.headers.get("location")).toBe("http://localhost:5173/inbox");
    const me = await (await get("/auth/me", auth)).json();
    expect(me.user).toMatchObject({ email: "riya@gmail.com", name: "Riya Sharma", has_password: false, google: { email: "riya@gmail.com", gmail: true } });
    expect(JSON.stringify(me)).not.toMatch(/refresh|ya29/);
    const stored = await User.findOne({ email: "riya@gmail.com" }).lean();
    expect(stored!.google!.refresh_enc).toBeTruthy();
    expect(stored!.google!.refresh_enc).not.toContain("1//refresh");
  });

  it("hands out a short-lived Gmail token after sign-in, so Gmail needs no second connect", async () => {
    fakeGoogle();
    const { auth } = await signInWithGoogle();
    const t = await (await get("/auth/google/token", auth)).json();
    expect(t).toMatchObject({ access_token: "ya29.short", email: "riya@gmail.com" });
    expect((await get("/auth/google/token")).status).toBe(401);
  });

  it("links Google to an existing password account with the same verified email", async () => {
    fakeGoogle();
    await fetch(`${base}/auth/signup`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Riya", email: "riya@gmail.com", password: "inbox2026" }) });
    await signInWithGoogle();
    expect(await User.countDocuments({})).toBe(1);
    const u = await User.findOne({ email: "riya@gmail.com" }).lean();
    expect(u!.google!.sub).toBe("g-123");
    expect(u!.password_hash).toBeTruthy();
  });

  it("refuses a token issued to another app, an unverified email, or a forged state", async () => {
    fakeGoogle({ aud: "someone-else" });
    let r = (await signInWithGoogle()).cb;
    expect(r.headers.get("location")).toMatch(/login\?google_error=.*different%20app/);
    fakeGoogle({ email_verified: "false" });
    r = (await signInWithGoogle()).cb;
    expect(r.headers.get("location")).toMatch(/google_error=.*not%20verified/);
    const forged = await get("/auth/google/callback?code=abc&state=forged");
    expect(forged.headers.get("location")).toMatch(/google_error=.*expired/);
    expect(await User.countDocuments({})).toBe(0);
  });

  it("says so when the server has no Google secret", async () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    const r = await get("/auth/google/start");
    expect(r.headers.get("location")).toMatch(/google_error=.*GOOGLE_CLIENT_SECRET/);
    expect((await (await get("/auth/google/config")).json()).enabled).toBe(false);
  });

  it("disconnecting Gmail revokes the stored access", async () => {
    const calls = fakeGoogle();
    const { auth } = await signInWithGoogle();
    await fetch(`${base}/auth/google/disconnect`, { method: "POST", headers: { cookie: auth } });
    expect(calls.some((c) => c.startsWith("https://oauth2.googleapis.com/revoke"))).toBe(true);
    expect((await get("/auth/google/token", auth)).status).toBe(404);
  });
});
