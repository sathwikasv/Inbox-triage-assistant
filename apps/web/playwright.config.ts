import { defineConfig } from "@playwright/test";

// Smoke test of the built app (run `pnpm --filter web build` first).
// Locally you can reuse an installed browser: PW_CHANNEL=msedge (or chrome) pnpm --filter web test:e2e
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts", // not *.spec.ts, so vitest does not pick these up
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://localhost:4173", channel: process.env.PW_CHANNEL || undefined, trace: "retain-on-failure" },
  webServer: { command: "npx vite preview --port 4173 --strictPort", port: 4173, reuseExistingServer: !process.env.CI },
});
