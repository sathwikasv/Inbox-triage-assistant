import { randomBytes } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import mongoose from "mongoose";
import { User, type UserDoc } from "../models/User.js";
import { readAuth, setAuth } from "../services/authCookie.js";
import { open, seal } from "../services/sessions.js";
import { authUrl, exchangeCode, googleConfig, refreshAccess, revoke, verifyIdToken } from "../services/google.js";

// /auth/google: sign in with Google, link read-only Gmail, hand the browser short-lived Gmail tokens.
export const googleRouter = Router();

const STATE_COOKIE = "td_gstate";
const web = () => (process.env.WEB_ORIGIN || process.env.CORS_ORIGIN?.split(",")[0] || "http://localhost:5173").trim().replace(/\/$/, "");
const safeNext = (n: unknown) => (typeof n === "string" && /^\/(?!\/)[\w\-/?=&%.]*$/.test(n) ? n : "/dashboard");
const secure = (req: Request) => req.secure || req.headers["x-forwarded-proto"] === "https";
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const back = (res: Response, error: string) => res.redirect(`${web()}/login?google_error=${encodeURIComponent(error)}`);

function readState(req: Request): { state: string; next: string } | null {
  const raw = (req.headers.cookie ?? "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);
  if (!raw) return null;
  try {
    return JSON.parse(open(decodeURIComponent(raw)));
  } catch {
    return null;
  }
}

async function signedIn(req: Request): Promise<UserDoc | null> {
  const a = readAuth(req);
  if (!a || !mongoose.isValidObjectId(a.uid) || mongoose.connection.readyState !== 1) return null;
  const u = (await User.findById(a.uid)) as UserDoc | null;
  return u && u.session_version === a.v ? u : null;
}

googleRouter.get("/config", (_req, res) => {
  const cfg = googleConfig();
  res.json(cfg.ok ? { enabled: mongoose.connection.readyState === 1, reason: mongoose.connection.readyState === 1 ? null : "Accounts need the database (MONGODB_URI)." } : { enabled: false, reason: cfg.reason });
});

// Step 1: off to Google's own sign-in page. The state ties the answer to this browser.
googleRouter.get("/start", (req, res) => {
  const cfg = googleConfig();
  if (!cfg.ok) return back(res, cfg.reason);
  if (mongoose.connection.readyState !== 1) return back(res, "Accounts need the database, which is not connected on this server (MONGODB_URI).");
  const state = randomBytes(24).toString("base64url");
  const value = encodeURIComponent(seal(JSON.stringify({ state, next: safeNext(req.query.next) })));
  res.append("Set-Cookie", `${STATE_COOKIE}=${value}; Path=/; HttpOnly; Max-Age=600; SameSite=Lax${secure(req) ? "; Secure" : ""}`);
  res.redirect(authUrl(cfg, state, typeof req.query.hint === "string" ? req.query.hint : undefined));
});

// Step 2: Google sends the person back with a one-time code.
googleRouter.get(
  "/callback",
  wrap(async (req, res) => {
    const saved = readState(req);
    res.append("Set-Cookie", `${STATE_COOKIE}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax${secure(req) ? "; Secure" : ""}`);
    if (typeof req.query.error === "string") return back(res, req.query.error === "access_denied" ? "Google sign-in was cancelled." : `Google said: ${req.query.error}`);
    if (!saved || saved.state !== req.query.state) return back(res, "The Google sign-in expired or did not start here. Please try again.");
    const cfg = googleConfig();
    if (!cfg.ok) return back(res, cfg.reason);
    try {
      const t = await exchangeCode(cfg, String(req.query.code ?? ""));
      const who = await verifyIdToken(cfg.clientId, t.id_token);
      const gmail = t.scope.split(" ").includes("https://www.googleapis.com/auth/gmail.readonly");
      let u = ((await User.findOne({ "google.sub": who.sub })) ?? (await User.findOne({ email: who.email }))) as UserDoc | null;
      if (!u) u = (await User.create({ email: who.email, name: who.name, password_hash: null, last_login_at: new Date() })) as UserDoc;
      const google = { sub: who.sub, email: who.email, refresh_enc: t.refresh_token && gmail ? seal(t.refresh_token) : (u.google?.refresh_enc ?? null), scope: t.scope, linked_at: new Date() };
      await User.updateOne({ _id: u._id }, { google, last_login_at: new Date(), failed_logins: 0, locked_until: null });
      setAuth(req, res, String(u._id), u.session_version);
      return res.redirect(`${web()}${saved.next}`);
    } catch (e) {
      return back(res, `Google sign-in failed: ${(e as Error).message}`);
    }
  }),
);

// A short-lived Gmail access token for the signed-in person (read-only). The refresh token stays here.
googleRouter.get(
  "/token",
  wrap(async (req, res) => {
    const u = await signedIn(req);
    if (!u) return res.status(401).json({ error: "not signed in" });
    if (!u.google?.refresh_enc) return res.status(404).json({ error: "Gmail is not linked to this account" });
    const cfg = googleConfig();
    if (!cfg.ok) return res.status(503).json({ error: cfg.reason });
    try {
      const t = await refreshAccess(cfg, open(u.google.refresh_enc));
      return res.json({ access_token: t.access_token, expires_in: t.expires_in, email: u.google.email });
    } catch (e) {
      await User.updateOne({ _id: u._id }, { "google.refresh_enc": null }); // revoked or expired: ask again
      return res.status(409).json({ error: `Google access ended (${(e as Error).message}). Continue with Google again to reconnect Gmail.` });
    }
  }),
);

googleRouter.post(
  "/disconnect",
  wrap(async (req, res) => {
    const u = await signedIn(req);
    if (!u) return res.status(401).json({ error: "not signed in" });
    if (u.google?.refresh_enc) await revoke(open(u.google.refresh_enc));
    await User.updateOne({ _id: u._id }, { "google.refresh_enc": null });
    return res.json({ ok: true });
  }),
);
