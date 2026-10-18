import { createHash, randomBytes } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";
import { User, publicUser, type UserDoc } from "../models/User.js";
import { hashPassword, passwordProblem, verifyPassword } from "../services/passwords.js";
import { clearAuth, readAuth, setAuth } from "../services/authCookie.js";
import { mailConfigured, mailer } from "../services/mailer.js";

// Triagedesk accounts: sign up, sign in, sign out, the signed-in user, and password reset.
// Accounts live in MongoDB; without a database these routes answer 503 instead of pretending.
export const authRouter = Router();

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;
const RESET_MS = 60 * 60_000;
const DUMMY_HASH = "scrypt$16384$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaA";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

authRouter.use((_req, res, next) => (mongoose.connection.readyState === 1 ? next() : res.status(503).json({ error: "Accounts need the database, which is not connected on this server (MONGODB_URI)." })));

const email = z.string().trim().toLowerCase().email("enter a valid email address").max(254);
const SignupSchema = z.object({ name: z.string().trim().min(1, "enter your name").max(80), email, password: z.string().min(1).max(200), timezone: z.string().max(64).optional(), use: z.enum(["work", "personal", "both"]).optional() }).strict();
const LoginSchema = z.object({ email, password: z.string().min(1, "enter your password").max(200) }).strict();
const ForgotSchema = z.object({ email }).strict();
const ResetSchema = z.object({ token: z.string().min(20).max(200), password: z.string().min(1).max(200) }).strict();
const PatchSchema = z
  .object({ name: z.string().trim().min(1).max(80).optional(), timezone: z.string().max(64).optional(), use: z.enum(["work", "personal", "both"]).optional(), onboarding_completed: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "nothing to change");

async function current(req: Request): Promise<UserDoc | null> {
  const a = readAuth(req);
  if (!a || !mongoose.isValidObjectId(a.uid)) return null;
  const u = (await User.findById(a.uid)) as UserDoc | null;
  return u && u.session_version === a.v ? u : null;
}

authRouter.post(
  "/signup",
  validateBody(SignupSchema),
  wrap(async (req, res) => {
    const { name, email: addr, password, timezone, use } = req.body as z.infer<typeof SignupSchema>;
    const weak = passwordProblem(password, addr);
    if (weak) return res.status(400).json({ error: `Choose a stronger password: ${weak}.`, field: "password" });
    if (await User.exists({ email: addr })) return res.status(409).json({ error: "An account with this email already exists. Sign in instead.", field: "email" });
    const u = (await User.create({ name, email: addr, password_hash: await hashPassword(password), timezone, use, last_login_at: new Date() })) as UserDoc;
    setAuth(req, res, String(u._id), u.session_version);
    return res.status(201).json({ user: publicUser(u) });
  }),
);

authRouter.post(
  "/login",
  validateBody(LoginSchema),
  wrap(async (req, res) => {
    const { email: addr, password } = req.body as z.infer<typeof LoginSchema>;
    const u = (await User.findOne({ email: addr })) as UserDoc | null;
    if (u?.locked_until && u.locked_until.getTime() > Date.now()) {
      const mins = Math.ceil((u.locked_until.getTime() - Date.now()) / 60_000);
      return res.status(429).json({ error: `Too many wrong passwords. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or reset your password.` });
    }
    const ok = await verifyPassword(password, u?.password_hash ?? DUMMY_HASH); // same work whether or not the account exists
    if (!u || !ok) {
      if (u) {
        const fails = u.failed_logins + 1;
        await User.updateOne({ _id: u._id }, fails >= MAX_FAILS ? { failed_logins: 0, locked_until: new Date(Date.now() + LOCK_MS) } : { failed_logins: fails });
      }
      return res.status(401).json({ error: "Wrong email or password." });
    }
    await User.updateOne({ _id: u._id }, { failed_logins: 0, locked_until: null, last_login_at: new Date() });
    setAuth(req, res, String(u._id), u.session_version);
    return res.json({ user: publicUser(u) });
  }),
);

authRouter.post("/logout", (req, res) => {
  clearAuth(req, res);
  res.json({ ok: true });
});

authRouter.get(
  "/me",
  wrap(async (req, res) => {
    const u = await current(req);
    return u ? res.json({ user: publicUser(u) }) : res.status(401).json({ error: "not signed in" });
  }),
);

authRouter.patch(
  "/me",
  validateBody(PatchSchema),
  wrap(async (req, res) => {
    const u = await current(req);
    if (!u) return res.status(401).json({ error: "not signed in" });
    Object.assign(u, req.body);
    await (u as unknown as mongoose.Document).save();
    return res.json({ user: publicUser(u) });
  }),
);

authRouter.post(
  "/forgot",
  validateBody(ForgotSchema),
  wrap(async (req, res) => {
    // Checked before looking the address up, so the answer never reveals whether an account exists.
    if (!mailConfigured()) return res.status(503).json({ error: "Password reset emails are not set up on this site yet. Ask the site owner to configure SMTP_URL." });
    const u = (await User.findOne({ email: (req.body as { email: string }).email })) as UserDoc | null;
    const recent = u?.reset_expires && u.reset_expires.getTime() - RESET_MS > Date.now() - 60_000;
    if (u && !recent) {
      const token = randomBytes(32).toString("base64url");
      await User.updateOne({ _id: u._id }, { reset_hash: sha(token), reset_expires: new Date(Date.now() + RESET_MS) });
      const origin = (process.env.WEB_ORIGIN || req.headers.origin || "").toString().replace(/\/$/, "");
      await mailer.send(u.email, "Reset your Triagedesk password", `Hi ${u.name},\n\nSomeone asked to reset the password for your Triagedesk account. If it was you, open this link within an hour:\n\n${origin}/reset?token=${token}\n\nIf it was not you, ignore this email; your password stays the same.\n\nTriagedesk`);
    }
    return res.json({ ok: true, message: "If an account exists for that email, a reset link is on its way. It works for one hour." });
  }),
);

authRouter.post(
  "/reset",
  validateBody(ResetSchema),
  wrap(async (req, res) => {
    const { token, password } = req.body as z.infer<typeof ResetSchema>;
    const u = (await User.findOne({ reset_hash: sha(token), reset_expires: { $gt: new Date() } })) as UserDoc | null;
    if (!u) return res.status(400).json({ error: "This reset link is invalid or has expired. Ask for a new one." });
    const weak = passwordProblem(password, u.email);
    if (weak) return res.status(400).json({ error: `Choose a stronger password: ${weak}.`, field: "password" });
    const v = u.session_version + 1; // signs out every other device
    await User.updateOne({ _id: u._id }, { password_hash: await hashPassword(password), reset_hash: null, reset_expires: null, session_version: v, failed_logins: 0, locked_until: null });
    setAuth(req, res, String(u._id), v);
    return res.json({ user: publicUser((await User.findById(u._id)) as UserDoc) });
  }),
);
