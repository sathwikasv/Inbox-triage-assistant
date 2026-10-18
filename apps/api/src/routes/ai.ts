import { Router, type NextFunction, type Request, type Response } from "express";
import mongoose from "mongoose";
import { validateBody } from "../middleware/validate.js";
import { ReplyRequestSchema, draftReplyWithAi } from "../services/aiReply.js";
import { AssistRequestSchema, assistWithAi, type AssistRequest, type MemoryContext, type RelatedContext } from "../services/aiAssist.js";
import { aiEnabled, aiModel } from "../services/ai.js";
import { readAuth } from "../services/authCookie.js";
import { ThreadMemory, subjectKey, type ThreadMemoryDoc } from "../models/ThreadMemory.js";

export const aiRouter = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
/** The signed-in user, when accounts (and so memory) are available. */
const userId = (req: Request) => {
  const a = readAuth(req);
  return a && mongoose.connection.readyState === 1 && mongoose.isValidObjectId(a.uid) ? new mongoose.Types.ObjectId(a.uid) : null;
};

aiRouter.get("/status", (_req, res) => res.json({ enabled: aiEnabled(), model: aiEnabled() ? aiModel() : null }));

// POST /ai/reply: an AI-written draft for a person to review. It is never saved or sent by the server.
aiRouter.post("/reply", validateBody(ReplyRequestSchema), (req, res, next) => {
  draftReplyWithAi(req.body)
    .then((r) => res.status(r.status === "ok" ? 200 : r.status === "rejected" ? 422 : r.status === "disabled" ? 503 : 502).json(r))
    .catch(next);
});

// POST /ai/assist: summary, key facts, a checked reply draft and review flags for one conversation.
// For a signed-in user it also keeps the conversation's memory: the model reads only messages it has not seen,
// with what it learned before and related conversations (same people or topic), and the notes are saved.
// Nothing is sent; the person decides.
aiRouter.post(
  "/assist",
  validateBody(AssistRequestSchema),
  wrap(async (req, res) => {
    const body = req.body as AssistRequest;
    const uid = userId(req);
    let mem: ThreadMemoryDoc | null = null;
    let related: RelatedContext[] = [];
    let messages = body.messages;
    if (uid && body.thread_key) {
      mem = (await ThreadMemory.findOne({ user_id: uid, thread_key: body.thread_key })) as ThreadMemoryDoc | null;
      if (mem?.last_message_at) {
        const fresh = messages.filter((m) => Date.parse(m.received_at) > mem!.last_message_at!.getTime());
        messages = fresh.length ? fresh : messages.slice(-1); // asked again with nothing new: re-read the newest
      }
      const people = (body.participants ?? []).map((p) => p.toLowerCase());
      const others = (await ThreadMemory.find({ user_id: uid, thread_key: { $ne: body.thread_key }, $or: [{ participants: { $in: people } }, { subject_key: subjectKey(body.subject) }] })
        .sort({ updated_at: -1 })
        .limit(3)
        .lean()) as unknown as ThreadMemoryDoc[];
      related = others.map((o) => ({ subject: o.subject, summary: o.summary, open: [...o.tasks.filter((t) => !t.done).map((t) => t.text ?? ""), ...o.open_questions].filter(Boolean).slice(0, 4) }));
    }
    const known: MemoryContext | null = mem ? { summary: mem.summary, facts: mem.facts, tasks: mem.tasks.map((t) => ({ text: t.text ?? "", owner: t.owner ?? null, due: t.due ?? null, done: !!t.done })), decisions: mem.decisions, open_questions: mem.open_questions, messages_read: mem.messages_read } : null;
    const r = await assistWithAi({ ...body, messages }, { memory: known, related });
    if (r.status === "ok" && uid && body.thread_key && r.memory) {
      const newest = [...body.messages].sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at)).at(-1)!;
      await ThreadMemory.updateOne(
        { user_id: uid, thread_key: body.thread_key },
        {
          $set: { ...r.memory, subject: body.subject, subject_key: subjectKey(body.subject), category: r.category, last_message_id: newest.id ?? null, last_message_at: new Date(newest.received_at) },
          $addToSet: { participants: { $each: (body.participants ?? []).map((p) => p.toLowerCase()) } },
          $inc: { messages_read: mem?.last_message_at ? messages.filter((m) => Date.parse(m.received_at) > mem!.last_message_at!.getTime()).length : body.messages.length },
        },
        { upsert: true },
      );
    }
    return res.status(r.status === "ok" ? 200 : r.status === "disabled" ? 503 : 502).json({ ...r, memory_saved: r.status === "ok" && !!uid && !!body.thread_key });
  }),
);

// GET /ai/memory: what the assistant remembers for the signed-in user (newest first).
aiRouter.get(
  "/memory",
  wrap(async (req, res) => {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: "Sign in to use the assistant's memory." });
    const items = await ThreadMemory.find({ user_id: uid }).sort({ updated_at: -1 }).limit(200).select("-user_id -__v").lean();
    return res.json({ items });
  }),
);

// DELETE /ai/memory: forget everything the assistant learned (optionally one conversation).
aiRouter.delete(
  "/memory",
  wrap(async (req, res) => {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: "Sign in to use the assistant's memory." });
    const q = typeof req.query.thread_key === "string" ? { user_id: uid, thread_key: req.query.thread_key } : { user_id: uid };
    const r = await ThreadMemory.deleteMany(q);
    return res.json({ deleted: r.deletedCount });
  }),
);
