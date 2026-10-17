import { Router } from "express";
import { runTriage } from "@c16/core";
import { TriageRun } from "../models/TriageRun.js";

export const runsRouter = Router();

// POST /runs — import + triage; idempotent by fixture hash
runsRouter.post("/", async (req, res) => {
  let result;
  try {
    result = runTriage(req.body);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
  const existing = await TriageRun.findOne({ fixtureHash: result.fixture_hash });
  if (existing) return res.json({ runId: existing.id, reused: true, result });
  const run = await TriageRun.create({ fixtureHash: result.fixture_hash, caseId: result.case_id, metrics: result.metrics });
  // TODO(A): persist decisions + drafts + audit event "import"
  return res.status(201).json({ runId: run.id, reused: false, result });
});

// TODO(A): GET /:id, PATCH /:id/decisions/:emailId, PUT /:id/drafts/:threadKey, POST /:id/preview, POST /:id/save, GET /:id/metrics
