// "Continue with Google": one sign-in that creates the Triagedesk account and grants read-only Gmail access.
// Server-side OAuth 2.0 authorization-code flow (the client secret never leaves the server). The refresh
// token is stored encrypted (AES-256-GCM with SESSION_SECRET) on the user; the browser only ever receives
// short-lived access tokens, kept in tab memory.

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const GOOGLE_SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.readonly"];
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const INFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/** Swappable in tests. */
export const googleHttp = { fetch: (url: string, init?: RequestInit) => fetch(url, init) };

export function googleConfig(): { ok: true; clientId: string; secret: string; redirect: string } | { ok: false; reason: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  const redirect = process.env.GOOGLE_REDIRECT_URI || "http://localhost:4000/auth/google/callback";
  if (!clientId || !secret) return { ok: false, reason: "Sign in with Google is not set up on this server yet (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)." };
  return { ok: true, clientId, secret, redirect };
}

export function authUrl(cfg: { clientId: string; redirect: string }, state: string, loginHint?: string, opts: { calendar?: boolean } = {}) {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirect,
    response_type: "code",
    scope: [...GOOGLE_SCOPES, ...(opts.calendar ? [GOOGLE_CALENDAR_SCOPE] : [])].join(" "), // Calendar only when asked for
    access_type: "offline", // a refresh token, so Gmail stays connected after reloads
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
    ...(loginHint ? { login_hint: loginHint } : {}),
  });
  return `${AUTH_URL}?${q}`;
}

async function post(url: string, body: Record<string, string>) {
  const res = await googleHttp.fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((json.error_description as string) || (json.error as string) || `Google ${res.status}`);
  return json;
}

export async function exchangeCode(cfg: { clientId: string; secret: string; redirect: string }, code: string) {
  const j = await post(TOKEN_URL, { code, client_id: cfg.clientId, client_secret: cfg.secret, redirect_uri: cfg.redirect, grant_type: "authorization_code" });
  return { access_token: j.access_token as string, expires_in: Number(j.expires_in ?? 3600), refresh_token: (j.refresh_token as string | undefined) ?? null, id_token: j.id_token as string, scope: String(j.scope ?? "") };
}

/** Google checks the ID token's signature; we check it was issued to this app, for a verified email. */
export async function verifyIdToken(clientId: string, idToken: string) {
  const res = await googleHttp.fetch(`${INFO_URL}?id_token=${encodeURIComponent(idToken)}`);
  const c = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (!res.ok) throw new Error("Google could not verify the sign-in");
  if (c.aud !== clientId) throw new Error("the sign-in was issued to a different app");
  if (!["accounts.google.com", "https://accounts.google.com"].includes(c.iss)) throw new Error("the sign-in did not come from Google");
  if (c.email_verified !== "true") throw new Error("Google has not verified this email address");
  return { sub: c.sub, email: c.email.toLowerCase(), name: c.name || c.email.split("@")[0] };
}

export async function refreshAccess(cfg: { clientId: string; secret: string }, refreshToken: string) {
  const j = await post(TOKEN_URL, { refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.secret, grant_type: "refresh_token" });
  return { access_token: j.access_token as string, expires_in: Number(j.expires_in ?? 3600), scope: String(j.scope ?? "") };
}

export async function revoke(token: string) {
  await googleHttp.fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
}
