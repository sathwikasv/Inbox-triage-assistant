import express from "express";
import cors from "cors";
import helmet from "helmet";
import { connectDb } from "./db.js";
import { runsRouter } from "./routes/runs.js";

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? "*" }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, policy: { draft_only: true, auto_send: false } }));
app.use("/runs", runsRouter);

const port = Number(process.env.PORT ?? 4000);
connectDb()
  .then(() => app.listen(port, () => console.log(`api listening on :${port}`)))
  .catch((e) => {
    console.error("db connection failed:", e.message);
    process.exit(1);
  });
