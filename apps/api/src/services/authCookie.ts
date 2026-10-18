import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

// The signed-in user, carried in an httpOnly cookie: "<user id>.<session version>.<expiry>.<signature>".
// The signature uses SESSION_SECRET; raising a user's session version (password reset, sign out
// everywhere) invalidates every cookie issued before.
export const AUTH_COOKIE = "td_auth";
const TTL_S = 7 * 24 * 3600;

const secret = () => process.env.SESSION_SECRET || "dev-only-session-secret-change-me";
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function readAuth(req: Request): { uid: string; v: number } | null {
  const raw = (req.headers.cookie ?? "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${AUTH_COOKIE}=`))
    ?.slice(AUTH_COOKIE.length + 1);
  if (!raw) return null;
  const parts = decodeURIComponent(raw).split(".");
  if (parts.length !== 4) return null;
  const [uid, v, exp, sig] = parts;
  const want = Buffer.from(sign(`${uid}.${v}.${exp}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  if (Number(exp) * 1000 < Date.now()) return null;
  return { uid, v: Number(v) };
}

const flags = (req: Request) => (req.secure || req.headers["x-forwarded-proto"] === "https" ? "Secure; SameSite=Lax" : "SameSite=Lax");

export function setAuth(req: Request, res: Response, uid: string, v: number) {
  const exp = Math.floor(Date.now() / 1000) + TTL_S;
  const payload = `${uid}.${v}.${exp}`;
  res.append("Set-Cookie", `${AUTH_COOKIE}=${encodeURIComponent(`${payload}.${sign(payload)}`)}; Path=/; HttpOnly; Max-Age=${TTL_S}; ${flags(req)}`);
}

export function clearAuth(req: Request, res: Response) {
  res.append("Set-Cookie", `${AUTH_COOKIE}=; Path=/; HttpOnly; Max-Age=0; ${flags(req)}`);
}
