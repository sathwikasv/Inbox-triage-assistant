import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import { yahooHttp } from "../src/providers/yahoo.js";
import { aiClient } from "../src/services/ai.js";
import { open, seal } from "../src/services/sessions.js";

let server: Server;
let base = "";
beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const realYahoo = yahooHttp.fetch;
const realAi = aiClient.fetch;
afterEach(() => {
  yahooHttp.fetch = realYahoo;
  aiClient.fetch = realAi;
  for (const k of ["YAHOO_CLIENT_ID", "YAHOO_CLIENT_SECRET", "YAHOO_REDIRECT_URI", "GEMINI_API_KEY"]) delete process.env[k];
});
const configure = () => Object.assign(process.env, { YAHOO_CLIENT_ID: "cid", YAHOO_CLIENT_SECRET: "secret", YAHOO_REDIRECT_URI: "http://localhost/providers/yahoo/callback" });

describe("token sealing", () => {
  it("encrypts tokens at rest in memory and round-trips them", () => {
    const sealed = seal("ya29.secret-token");
    expect(sealed).not.toContain("secret-token");
    expect(open(sealed)).toBe("ya29.secret-token");
  });
});

describe("Yahoo over OAuth 2.0", () => {
  it("reports that it is not configured without server credentials", async () => {
    const r = await (await fetch(`${base}/providers/yahoo/status`)).json();
    expect(r).toMatchObject({ configured: false, connected: false });
    expect(r.reason).toMatch(/YAHOO_CLIENT_ID/);
  });

  it("sends the person to Yahoo's consent page with read-only scope and a state, and sets an httpOnly cookie", async () => {
    configure();
    const res = await fetch(`${base}/providers/yahoo/start`, { redirect: "manual" });
    expect(res.status).toBe(302);
    const url = new URL(res.headers.get("location")!);
    expect(url.origin + url.pathname).toBe("https://api.login.yahoo.com/oauth2/request_auth");
    expect(url.searchParams.get("scope")).toBe("openid email mail-r");
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(res.headers.get("set-cookie")).toMatch(/td_sid=.+HttpOnly/);
    const send = await fetch(`${base}/providers/yahoo/start?send=1`, { redirect: "manual" });
    expect(new URL(send.headers.get("location")!).searchParams.get("scope")).toBe("openid email mail-r mail-w");
  });

  it("rejects a callback whose state was not started by this browser", async () => {
    configure();
    const res = await fetch(`${base}/providers/yahoo/callback?code=abc&state=forged`);
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/"ok":false/);
  });

  it("completes the code exchange, never exposes tokens, and blocks sending until mail-w is granted", async () => {
    configure();
    const calls: string[] = [];
    yahooHttp.fetch = async (url) => {
      calls.push(String(url));
      if (String(url).includes("get_token")) return new Response(JSON.stringify({ access_token: "ACCESS-123", refresh_token: "REFRESH-456", expires_in: 3600 }), { status: 200 });
      return new Response(JSON.stringify({ email: "riya@yahoo.com" }), { status: 200 });
    };
    const start = await fetch(`${base}/providers/yahoo/start`, { redirect: "manual" });
    const cookie = start.headers.get("set-cookie")!.split(";")[0];
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const cb = await fetch(`${base}/providers/yahoo/callback?code=one-time&state=${state}`, { headers: { cookie } });
    expect(cb.status).toBe(200);
    const html = await cb.text();
    expect(html).toMatch(/"ok":true/);
    expect(html).not.toMatch(/ACCESS-123|REFRESH-456/);
    expect(calls[0]).toMatch(/get_token/);

    const status = await (await fetch(`${base}/providers/yahoo/status`, { headers: { cookie } })).json();
    expect(status).toEqual({ configured: true, connected: true, email: "riya@yahoo.com", accounts: [{ email: "riya@yahoo.com", can_send: false }] });
    expect(JSON.stringify(status)).not.toMatch(/ACCESS|REFRESH/);

    const send = await fetch(`${base}/providers/yahoo/send`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ to: [{ email: "a@b.co" }], cc: [], subject: "Re: x", body: "Hi", in_reply_to: null }) });
    expect(send.status).toBe(403);
    // The same state cannot be replayed.
    expect((await fetch(`${base}/providers/yahoo/callback?code=one-time&state=${state}`, { headers: { cookie } })).status).toBe(400);
  });

  it("refuses to read mail for a browser that never connected", async () => {
    expect((await fetch(`${base}/providers/yahoo/messages`)).status).toBe(401);
  });
});

describe("AI reply drafts", () => {
  const request = {
    subject: "Pilot incident",
    tone: "standard",
    user_name: "Riya",
    messages: [
      { from: "Arjun", direction: "inbound", received_at: "2026-10-16T09:00:00+05:30", body: "Please fix duplicate ticket creation. Owner Dev. Due 18 October." },
      { from: "Arjun", direction: "inbound", received_at: "2026-10-16T10:00:00+05:30", body: "Correction: due 20 October. Keep one ticket only." },
    ],
  };
  const fakeAi = (body: string) => {
    const seen: string[] = [];
    aiClient.fetch = async (_url, init) => {
      seen.push(String(init.body));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ body }) }] } }] }), { status: 200 });
    };
    return seen;
  };
  const post = (b: unknown) => fetch(`${base}/ai/reply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

  it("is unavailable without a key (the app falls back to templates)", async () => {
    expect((await post(request)).status).toBe(503);
  });

  it("passes the extracted facts, including the superseded date, and returns a clean draft", async () => {
    process.env.GEMINI_API_KEY = "k";
    const seen = fakeAi("Hi Arjun,\n\nThanks, Dev is fixing duplicate ticket creation, due 20 October 2026. We will keep one ticket.\n\nRiya");
    const r = await post(request);
    expect(r.status).toBe(200);
    expect((await r.json()).body).toMatch(/20 October 2026/);
    expect(seen[0]).toMatch(/Agreed deadline: 2026-10-20/);
    expect(seen[0]).toMatch(/Superseded dates \(never use\): 2026-10-18/);
  });

  it("rejects an AI draft that invents an attachment or uses the superseded date", async () => {
    process.env.GEMINI_API_KEY = "k";
    fakeAi("Hi Arjun,\n\nDev will fix it by 18 October. The patch is attached.\n\nRiya");
    const r = await post(request);
    expect(r.status).toBe(422);
    const j = await r.json();
    expect(j.status).toBe("rejected");
    expect(j.violations.map((v: { reason: string }) => v.reason).join(" ")).toMatch(/attachment|superseded/);
  });

  it("validates the request shape", async () => {
    expect((await post({ ...request, tone: "angry" })).status).toBe(400);
  });
});

describe("several Yahoo accounts in one browser session", () => {
  it("connects two accounts without overwriting, and manages them independently", async () => {
    configure();
    const who: Record<string, string> = {};
    yahooHttp.fetch = async (url, init) => {
      const u = String(url);
      if (u.includes("get_token")) {
        const code = new URLSearchParams(String(init?.body)).get("code")!;
        who.last = code === "code-a" ? "a@yahoo.com" : "b@yahoo.com";
        return new Response(JSON.stringify({ access_token: `ACCESS-${code}`, refresh_token: `REFRESH-${code}`, expires_in: 3600 }), { status: 200 });
      }
      return new Response(JSON.stringify({ email: who.last }), { status: 200 });
    };
    const connect = async (code: string, cookie?: string, email?: string) => {
      const start = await fetch(`${base}/providers/yahoo/start${email ? `?email=${email}` : ""}`, { redirect: "manual", headers: cookie ? { cookie } : {} });
      const ck = cookie ?? start.headers.get("set-cookie")!.split(";")[0];
      const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
      expect((await fetch(`${base}/providers/yahoo/callback?code=${code}&state=${state}`, { headers: { cookie: ck } })).status).toBe(200);
      return { ck, location: start.headers.get("location")! };
    };
    const first = await connect("code-a");
    const second = await connect("code-b", first.ck, "b@yahoo.com");
    expect(new URL(second.location).searchParams.get("login_hint")).toBe("b@yahoo.com");
    const status = await (await fetch(`${base}/providers/yahoo/status`, { headers: { cookie: first.ck } })).json();
    expect(status.accounts.map((x: { email: string }) => x.email).sort()).toEqual(["a@yahoo.com", "b@yahoo.com"]);
    expect(status.email).toBe("b@yahoo.com"); // the latest is the default
    // a request that names the account reaches that account; others are untouched
    const send = (email: string) => fetch(`${base}/providers/yahoo/send`, { method: "POST", headers: { cookie: first.ck, "content-type": "application/json" }, body: JSON.stringify({ to: [{ email: "x@y.co" }], cc: [], subject: "Re: x", body: "Hi", in_reply_to: null, email }) });
    expect((await send("a@yahoo.com")).status).toBe(403); // neither has mail-w yet
    expect((await send("nobody@yahoo.com")).status).toBe(401);
    // disconnecting one leaves the other connected
    await fetch(`${base}/providers/yahoo/disconnect?email=b@yahoo.com`, { method: "POST", headers: { cookie: first.ck } });
    const after = await (await fetch(`${base}/providers/yahoo/status`, { headers: { cookie: first.ck } })).json();
    expect(after.accounts.map((x: { email: string }) => x.email)).toEqual(["a@yahoo.com"]);
    expect(after.email).toBe("a@yahoo.com");
    await fetch(`${base}/providers/yahoo/disconnect`, { method: "POST", headers: { cookie: first.ck } });
    expect((await (await fetch(`${base}/providers/yahoo/status`, { headers: { cookie: first.ck } })).json()).accounts).toEqual([]);
  });
});
