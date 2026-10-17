import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";

// Browser sessions for provider connections that need a server (Yahoo). The browser only holds an opaque,
// httpOnly session cookie; OAuth tokens stay in this process, encrypted with AES-256-GCM, and are never
// logged or returned to the client. Restarting the server forgets every connection.

const COOKIE = "td_sid";
const TTL_MS = 12 * 60 * 60 * 1000;

export interface ProviderTokens {
  email: string;
  access: string; // encrypted
  refresh: string | null; // encrypted
  expires_at: number;
  can_send: boolean;
}

interface Session {
  created: number;
  oauth_state?: { value: string; send: boolean; at: number };
  yahoo?: ProviderTokens;
}

const sessions = new Map<string, Session>();

const key = () => createHash("sha256").update(process.env.SESSION_SECRET || "dev-only-session-secret-change-me").digest();

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64url");
}

export function open(sealed: string): string {
  const buf = Buffer.from(sealed, "base64url");
  const d = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}

function readCookie(req: Request): string | null {
  const raw = req.headers.cookie ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** The caller's session, creating one (and its cookie) when asked. */
export function session(req: Request, res: Response, create = false): Session | null {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.created > TTL_MS) sessions.delete(id);
  const id = readCookie(req);
  if (id && sessions.has(id)) return sessions.get(id)!;
  if (!create) return null;
  const sid = randomBytes(24).toString("base64url");
  const s: Session = { created: now };
  sessions.set(sid, s);
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  // Cross-site (web app and API on different hosts) needs SameSite=None, which browsers only accept with Secure.
  res.append("Set-Cookie", `${COOKIE}=${sid}; Path=/; HttpOnly; Max-Age=${TTL_MS / 1000}; ${secure ? "SameSite=None; Secure" : "SameSite=Lax"}`);
  return s;
}

export const _sessionsForTests = sessions;
