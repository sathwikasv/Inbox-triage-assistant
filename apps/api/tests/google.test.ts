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

describe("several Gmail accounts linked to one person", () => {
  /** Google's endpoints, answering as whichever account is being authorised. */
  function fakeAccounts() {
    let current = { sub: "g-1", email: "riya@gmail.com" };
    googleHttp.fetch = async (url, init) => {
      const u = String(url);
      if (u === "https://oauth2.googleapis.com/token") {
        const body = new URLSearchParams(String(init?.body));
        if (body.get("grant_type") === "refresh_token") return Response.json({ access_token: `ya29.for-${body.get("refresh_token")}`, expires_in: 3599, scope: "x" });
        const code = body.get("code")!;
        current = code === "code-work" ? { sub: "g-2", email: "riya@acme.com" } : { sub: "g-1", email: "riya@gmail.com" };
        return Response.json({ access_token: "ya29.x", expires_in: 3599, refresh_token: `1//refresh-${current.email}`, id_token: "idtok", scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly" });
      }
      if (u.startsWith("https://oauth2.googleapis.com/tokeninfo")) return Response.json({ aud: "cid.apps.googleusercontent.com", iss: "https://accounts.google.com", sub: current.sub, email: current.email, email_verified: "true", name: "Riya Sharma" });
      return Response.json({}, { status: 200 });
    };
  }
  async function link(auth: string, code: string, company?: string) {
    const start = await get(`/auth/google/start?link=1${company ? `&company=${encodeURIComponent(company)}` : ""}`, auth);
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    return get(`/auth/google/callback?code=${code}&state=${state}`, `${auth}; ${cookieOf(start, "td_gstate")}`);
  }
  const call = (method: string, path: string, auth: string, body?: unknown) => fetch(base + path, { method, headers: { cookie: auth, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

  it("adds a second account to the signed-in person without replacing the first", async () => {
    fakeAccounts();
    const { auth } = await signInWithGoogle();
    const cb = await link(auth, "code-work", "Acme Corp");
    expect(cb.headers.get("location")).toBe("http://localhost:5173/dashboard");
    const list = await (await call("GET", "/auth/google/accounts", auth)).json();
    expect(list.accounts).toEqual([
      { email: "riya@gmail.com", company: null, primary: true },
      { email: "riya@acme.com", company: "Acme Corp", primary: false },
    ]);
    const me = await (await get("/auth/me", auth)).json();
    expect(me.user.email).toBe("riya@gmail.com"); // still signed in as the first account
    expect(JSON.stringify(me)).not.toMatch(/refresh|ya29/);
    expect(await User.countDocuments({})).toBe(1);
  });

  it("hands out the token of the account that was asked for, and the primary one by default", async () => {
    fakeAccounts();
    const { auth } = await signInWithGoogle();
    await link(auth, "code-work", "Acme Corp");
    expect((await (await call("GET", "/auth/google/token", auth)).json()).email).toBe("riya@gmail.com");
    const work = await (await call("GET", "/auth/google/token?email=riya@acme.com", auth)).json();
    expect(work).toMatchObject({ email: "riya@acme.com", company: "Acme Corp", access_token: "ya29.for-1//refresh-riya@acme.com" });
    expect((await call("GET", "/auth/google/token?email=other@x.com", auth)).status).toBe(404);
  });

  it("relabels the company, and disconnects one account while the other stays connected", async () => {
    const calls: string[] = [];
    fakeAccounts();
    const inner = googleHttp.fetch;
    googleHttp.fetch = async (url, init) => (calls.push(String(url)), inner(url, init));
    const { auth } = await signInWithGoogle();
    await link(auth, "code-work");
    await call("PATCH", "/auth/google/accounts", auth, { email: "riya@acme.com", company: "Acme" });
    await call("PATCH", "/auth/google/accounts", auth, { company: "Personal" }); // no email: the primary
    let list = (await (await call("GET", "/auth/google/accounts", auth)).json()).accounts;
    expect(list.map((a: { company: string }) => a.company)).toEqual(["Personal", "Acme"]);
    await call("POST", "/auth/google/disconnect", auth, { email: "riya@acme.com" });
    expect(calls.some((c) => c.startsWith("https://oauth2.googleapis.com/revoke"))).toBe(true);
    list = (await (await call("GET", "/auth/google/accounts", auth)).json()).accounts;
    expect(list.map((a: { email: string }) => a.email)).toEqual(["riya@gmail.com"]);
    expect((await call("GET", "/auth/google/token", auth)).status).toBe(200);
  });

  it("only links accounts for someone who is signed in", async () => {
    fakeAccounts();
    const start = await get("/auth/google/start?link=1");
    expect(start.headers.get("location")).toMatch(/google_error=.*Sign%20in%20first/);
  });
});

describe("Google Calendar permission", () => {
  it("asks for calendar.events only when ?calendar=1, and keeps the default scopes otherwise", async () => {
    const plain = new URL((await get("/auth/google/start")).headers.get("location")!);
    expect(plain.searchParams.get("scope")).toBe("openid email profile https://www.googleapis.com/auth/gmail.readonly");
    const cal = new URL((await get("/auth/google/start?calendar=1&next=/calendar&hint=riya@gmail.com")).headers.get("location")!);
    expect(cal.searchParams.get("scope")).toBe("openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events");
    expect(cal.searchParams.get("access_type")).toBe("offline");
    expect(cal.searchParams.get("include_granted_scopes")).toBe("true");
    expect(cal.searchParams.get("login_hint")).toBe("riya@gmail.com");
  });

  it("returns the granted scope with the token, so the app knows whether Calendar is allowed", async () => {
    fakeGoogle();
    const inner = googleHttp.fetch;
    googleHttp.fetch = async (url, init) => {
      if (String(url) === "https://oauth2.googleapis.com/token" && new URLSearchParams(String(init?.body)).get("grant_type") === "refresh_token") return Response.json({ access_token: "ya29.cal", expires_in: 3599, scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events" });
      return inner(url, init);
    };
    const { auth } = await signInWithGoogle();
    const t = await (await get("/auth/google/token", auth)).json();
    expect(t.scope).toContain("https://www.googleapis.com/auth/calendar.events");
  });
});
