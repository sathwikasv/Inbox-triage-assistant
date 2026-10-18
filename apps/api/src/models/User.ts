import mongoose, { Schema, type InferSchemaType } from "mongoose";

// A Triagedesk account. Mailbox access is never stored here: Gmail and Outlook tokens stay in the browser
// tab, Yahoo tokens in server memory. The password is only kept as a scrypt hash.
const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    password_hash: { type: String, required: true },
    timezone: { type: String, default: "Asia/Kolkata", maxlength: 64 },
    use: { type: String, enum: ["work", "personal", "both"], default: "both" },
    onboarding_completed: { type: Boolean, default: false },
    session_version: { type: Number, default: 0 },
    failed_logins: { type: Number, default: 0 },
    locked_until: { type: Date, default: null },
    reset_hash: { type: String, default: null },
    reset_expires: { type: Date, default: null },
    last_login_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: mongoose.Types.ObjectId };
export const User = mongoose.models.User ?? mongoose.model("User", UserSchema);

/** What the browser may see about an account. */
export const publicUser = (u: UserDoc) => ({ id: String(u._id), email: u.email, name: u.name, timezone: u.timezone, use: u.use, onboarding_completed: u.onboarding_completed, created_at: (u as unknown as { created_at: Date }).created_at });
