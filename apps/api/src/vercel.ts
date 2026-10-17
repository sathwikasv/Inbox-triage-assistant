import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "./app.js";

// Vercel entry: the same Express app as src/index.ts, served as one function under /api on the web app's
// own domain (so no CORS is needed). Settings come from the Vercel project's environment variables.
// No database here: /runs answers 503, everything else works.
const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // The route hands the original path over as ?__path=…; strip the /api prefix either way.
  const url = new URL(req.url ?? "/", "http://local");
  const path = url.searchParams.get("__path");
  if (path !== null) {
    url.searchParams.delete("__path");
    req.url = `/${path}${url.search}`;
  } else if (req.url?.startsWith("/api")) req.url = req.url.slice(4) || "/";
  return app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
