import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { authorizeUrl, exchangeCode, fetchYahoo, sendYahoo, yahooConfig } from "../providers/yahoo.js";
import { addYahoo, removeYahoo, session, yahooOf } from "../services/sessions.js";
import { validateBody } from "../middleware/validate.js";

export const yahooRouter = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const webOrigin = () => process.env.WEB_ORIGIN || process.env.CORS_ORIGIN?.split(",")[0]?.trim() || "*";

/** The popup page that hands the result back to the web app, then closes. Contains no tokens. */
function popupResult(res: Response, ok: boolean, error?: string) {
  const payload = JSON.stringify({ source: "triagedesk-yahoo", ok, error: error ?? null }).replace(/</g, "\\u003c");
  res
    .status(ok ? 200 : 400)
    .type("html")
    .send(`<!doctype html><meta charset="utf-8"><title>Yahoo</title><p>${ok ? "Connected. You can close this window." : "Yahoo was not connected."}</p><script>try{window.opener&&window.opener.postMessage(${payload}, ${JSON.stringify(webOrigin())});}finally{setTimeout(function(){window.close()},300)}</script>`);
}

yahooRouter.get("/status", (req, res) => {
  const cfg = yahooConfig();
  const s = session(req, res);
  res.json({
    configured: cfg.ok,
    reason: cfg.ok ? undefined : cfg.reason,
    connected: !!s?.yahoo,
    email: s?.yahoo?.email,
    accounts: Object.values(s?.yahoos ?? {}).map((y) => ({ email: y.email, can_send: y.can_send })),
  });
});

// Step 1: send the person to Yahoo's own consent page. ?send=1 also asks for mail-w (sending).
yahooRouter.get("/start", (req, res) => {
  const cfg = yahooConfig();
  if (!cfg.ok) return popupResult(res, false, cfg.reason);
  const s = session(req, res, true)!;
  const send = req.query.send === "1";
  const hint = typeof req.query.email === "string" ? req.query.email : undefined; // the account being reconnected or upgraded
  const { url, state } = authorizeUrl(send, hint);
  s.oauth_state = { value: state, send, at: Date.now() };
  return res.redirect(url);
});

// Step 2: Yahoo redirects back with a one-time code; the state must match the one this session started.
yahooRouter.get(
  "/callback",
  wrap(async (req, res) => {
    const s = session(req, res);
    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error) return popupResult(res, false, `Yahoo said: ${error}`);
    if (!s?.oauth_state || !state || state !== s.oauth_state.value || Date.now() - s.oauth_state.at > 10 * 60_000) return popupResult(res, false, "the sign-in expired or did not start here; try again");
    if (!code) return popupResult(res, false, "Yahoo did not return a code");
    try {
      const send = s.oauth_state.send;
      s.oauth_state = undefined;
      addYahoo(s, await exchangeCode(code, send)); // another Yahoo account is added; the others stay connected
      return popupResult(res, true);
    } catch (e) {
      return popupResult(res, false, (e as Error).message);
    }
  }),
);

yahooRouter.get(
  "/messages",
  wrap(async (req, res) => {
    const s = session(req, res);
    const y = yahooOf(s, req.query.email);
    if (!y) return res.status(401).json({ error: "Yahoo is not connected in this browser" });
    try {
      return res.json(await fetchYahoo(y));
    } catch (e) {
      return res.status(502).json({ error: `Yahoo mail could not be read: ${(e as Error).message}` });
    }
  }),
);

const SendSchema = z
  .object({
    to: z.array(z.object({ name: z.string().optional(), email: z.string().email() })).min(1).max(20),
    cc: z.array(z.object({ name: z.string().optional(), email: z.string().email() })).max(20),
    subject: z.string().min(1).max(300),
    body: z.string().min(1).max(20_000),
    in_reply_to: z.string().max(500).nullable(),
    email: z.string().email().optional(), // which connected Yahoo account to send from
  })
  .strict();

// Only reached after the person reviewed and confirmed the reply in the app. Never called by a rule or model.
yahooRouter.post(
  "/send",
  validateBody(SendSchema),
  wrap(async (req, res) => {
    const s = session(req, res);
    const y = yahooOf(s, req.query.email ?? req.body.email);
    if (!y) return res.status(401).json({ error: "Yahoo is not connected in this browser" });
    if (!y.can_send) return res.status(403).json({ error: "allow sending for this Yahoo account first" });
    try {
      return res.json(await sendYahoo(y, req.body));
    } catch (e) {
      return res.status(502).json({ error: `Yahoo did not accept the email: ${(e as Error).message}` });
    }
  }),
);

// Disconnects one Yahoo account (?email= or body.email), or all of them when none is named.
yahooRouter.post("/disconnect", (req, res) => {
  const s = session(req, res);
  if (s) removeYahoo(s, req.query.email ?? (req.body as { email?: string } | undefined)?.email);
  res.json({ ok: true });
});
