import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connectDb } from "./db.js";
import { createApp } from "./app.js";

// Settings come from the environment. Locally: apps/api/.env, then the repo-root .env (shared with the web app,
// which only ever reads its VITE_ variables). A variable that is already set (e.g. on Render) is never overwritten.
for (const file of [".env", fileURLToPath(new URL("../../../.env", import.meta.url))]) if (existsSync(file)) process.loadEnvFile(file);

const port = Number(process.env.PORT ?? 4000);
const start = () => createApp().listen(port, () => console.log(`api listening on :${port}`));

if (process.env.MONGODB_URI) {
  connectDb()
    .then(start)
    .catch((e) => {
      console.error("db connection failed:", e.message);
      process.exit(1);
    });
} else {
  console.log("MONGODB_URI is not set: starting without the database. Mail, Yahoo and the AI assistant work; the case-evaluation API (/runs) is off.");
  start();
}
