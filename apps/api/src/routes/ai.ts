import { Router } from "express";
import { validateBody } from "../middleware/validate.js";
import { ReplyRequestSchema, draftReplyWithAi } from "../services/aiReply.js";
import { aiEnabled, aiModel } from "../services/ai.js";

export const aiRouter = Router();

aiRouter.get("/status", (_req, res) => res.json({ enabled: aiEnabled(), model: aiEnabled() ? aiModel() : null }));

// POST /ai/reply: an AI-written draft for a person to review. It is never saved or sent by the server.
aiRouter.post("/reply", validateBody(ReplyRequestSchema), (req, res, next) => {
  draftReplyWithAi(req.body)
    .then((r) => res.status(r.status === "ok" ? 200 : r.status === "rejected" ? 422 : r.status === "disabled" ? 503 : 502).json(r))
    .catch(next);
});
