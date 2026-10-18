import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Settings live in one .env at the repo root (see .env.example). Vite only exposes VITE_ variables to the
// browser, so the server's secrets in the same file never reach the web app. End-to-end tests build in
// "e2e" mode, which reads no .env at all, so they always run against the labelled demo mailboxes.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  envDir: fileURLToPath(new URL(mode === "e2e" ? "./e2e" : "../..", import.meta.url)),
}));
