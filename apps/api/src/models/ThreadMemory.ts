import mongoose, { Schema, type InferSchemaType } from "mongoose";

// What the AI assistant has learned about one conversation, per user: a running summary, facts, tasks,
// decisions and open questions, the people involved, and which messages it has already read. When a new
// email arrives only the new messages are read, together with this memory and related conversations.
// Derived notes only: the email bodies themselves are not stored here.
const Task = new Schema({ text: { type: String, maxlength: 300 }, owner: { type: String, default: null, maxlength: 120 }, due: { type: String, default: null, maxlength: 40 }, done: { type: Boolean, default: false } }, { _id: false });

const ThreadMemorySchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, required: true, index: true },
    thread_key: { type: String, required: true, maxlength: 300 },
    subject: { type: String, default: "", maxlength: 300 },
    subject_key: { type: String, default: "", index: true, maxlength: 300 },
    participants: { type: [String], default: [], index: true },
    summary: { type: String, default: "", maxlength: 1500 },
    facts: { type: [String], default: [] },
    tasks: { type: [Task], default: [] },
    decisions: { type: [String], default: [] },
    open_questions: { type: [String], default: [] },
    category: { type: String, default: null },
    last_message_id: { type: String, default: null },
    last_message_at: { type: Date, default: null },
    messages_read: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);
ThreadMemorySchema.index({ user_id: 1, thread_key: 1 }, { unique: true });

export type ThreadMemoryDoc = InferSchemaType<typeof ThreadMemorySchema> & { _id: mongoose.Types.ObjectId };
export const ThreadMemory = mongoose.models.ThreadMemory ?? mongoose.model("ThreadMemory", ThreadMemorySchema);

/** "Re: Fwd: Q3 numbers" → "q3 numbers", so replies and forwards find the same memory. */
export const subjectKey = (s: string) => s.replace(/^((re|fwd?|fw|aw)\s*:\s*)+/i, "").trim().toLowerCase().slice(0, 300);
