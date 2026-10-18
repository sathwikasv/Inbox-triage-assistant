// Lists which settings in the repo-root .env are present, without printing any value.
// Usage: pnpm check:env
import { existsSync, readFileSync } from "node:fs";

const file = new URL("../.env", import.meta.url);
if (!existsSync(file)) {
  console.log("No .env file at the repo root yet. Copy .env.example to .env and fill it in.");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const has = (k) => !!env[k];
const checks = [
  ["Gmail + Google Calendar", ["VITE_GOOGLE_CLIENT_ID"], () => /\.apps\.googleusercontent\.com$/.test(env.VITE_GOOGLE_CLIENT_ID ?? "") || "VITE_GOOGLE_CLIENT_ID should end in .apps.googleusercontent.com"],
  ["Server address for the web app", ["VITE_API_URL"], () => /^https?:\/\//.test(env.VITE_API_URL ?? "") || "VITE_API_URL should start with http:// or https://"],
  ["AI assistant (Gemini)", ["GEMINI_API_KEY"], () => true],
  ["Token encryption", ["SESSION_SECRET"], () => (env.SESSION_SECRET ?? "").length >= 16 || "SESSION_SECRET should be at least 16 characters"],
  ["Yahoo Mail", ["YAHOO_CLIENT_ID", "YAHOO_CLIENT_SECRET", "YAHOO_REDIRECT_URI"], () => true],
  ["Case-evaluation database (optional)", ["MONGODB_URI"], () => true],
];
for (const [label, keys, valid] of checks) {
  const missing = keys.filter((k) => !has(k));
  const v = missing.length ? null : valid();
  const mark = missing.length ? "  not set " : v === true ? "  ok      " : "  check   ";
  console.log(`${mark} ${label}${missing.length ? ` (${missing.join(", ")})` : v === true ? "" : `: ${v}`}`);
}
const leaked = Object.keys(env).filter((k) => /^VITE_/.test(k) && /SECRET|KEY|PASSWORD|TOKEN/i.test(k) && has(k));
if (leaked.length) console.log(`\nWarning: ${leaked.join(", ")} would be visible in the browser. Secrets must not start with VITE_.`);
