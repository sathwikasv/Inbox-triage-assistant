import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Settings live in one .env at the repo root (see .env.example). Vite only exposes VITE_ variables to the
// browser, so the server's secrets in the same file never reach the web app.
export default defineConfig({ plugins: [react()], envDir: fileURLToPath(new URL("../..", import.meta.url)) });
