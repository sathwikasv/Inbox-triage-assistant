import { defineConfig } from "@playwright/test";

// End-to-end tests of the built app. `pnpm --filter web test:e2e` builds it in "e2e" mode (no .env, demo mailboxes) first.
// Locally you can reuse an installed browser: PW_CHANNEL=msedge (or chrome) pnpm --filter web test:e2e
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts", // not *.spec.ts, so vitest does not pick these up
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://localhost:4173", channel: process.env.PW_CHANNEL || undefined, trace: "retain-on-failure" },
  webServer: { command: "npx vite preview --outDir dist-e2e --port 4173 --strictPort", port: 4173, reuseExistingServer: !process.env.CI },
});
