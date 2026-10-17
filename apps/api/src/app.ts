import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import { POLICY } from "@c16/core";
import { runsRouter } from "./routes/runs.js";
import { classifyRouter } from "./routes/classify.js";
import { yahooRouter } from "./routes/yahoo.js";
import { aiRouter } from "./routes/ai.js";
import { aiEnabled, aiModel } from "./services/ai.js";

export function createApp() {
  const app = express();
  app.use(helmet());
  app.set("trust proxy", 1); // Render terminates TLS; needed to mark the session cookie Secure
  // Credentials (the Yahoo session cookie) require an explicit origin list, never "*".
  const origins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim()) : null;
  app.use(cors(origins ? { origin: origins, credentials: true } : { origin: "*" }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) =>
    res.json({ ok: true, db: mongoose.connection.readyState === 1 ? "connected" : "disconnected", policy: POLICY, ai: { enabled: aiEnabled(), model: aiModel() } }),
  );
  app.use("/runs", runsRouter);
  app.use("/classify", classifyRouter);
  app.use("/providers/yahoo", yahooRouter);
  app.use("/ai", aiRouter);

  app.use((_req, res) => res.status(404).json({ error: "not found" }));
  // Malformed JSON bodies and unexpected errors come back as JSON, never as an HTML stack trace.
  app.use((err: Error & { type?: string; status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "invalid fixture", issues: [{ path: "(body)", message: "not valid JSON" }] });
    if (err.type === "entity.too.large") return res.status(413).json({ error: "file too large (limit 2 MB)" });
    console.error(err);
    return res.status(500).json({ error: "internal error" });
  });
  return app;
}
