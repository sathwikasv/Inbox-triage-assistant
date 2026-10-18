import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "./app.js";
import { connectDb } from "./db.js";

// Vercel entry: the same Express app as src/index.ts, served as one function under /api on the web app's
// own domain (so no CORS is needed). Settings come from the Vercel project's environment variables.
// With MONGODB_URI the database is connected once per warm function instance (accounts, /runs);
// without it those routes answer 503 and everything else works.
const app = createApp();
let db: Promise<unknown> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (process.env.MONGODB_URI && !db) db = connectDb().catch((e) => ((db = null), console.error("db connection failed:", e.message)));
  if (db) await db;
  // The route hands the original path over as ?__path=…; strip the /api prefix either way.
  const url = new URL(req.url ?? "/", "http://local");
  const path = url.searchParams.get("__path");
  if (path !== null) {
    url.searchParams.delete("__path");
    req.url = `/${path}${url.search}`;
  } else if (req.url?.startsWith("/api")) req.url = req.url.slice(4) || "/";
  return app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
