import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Use the MongoDB binary that `pnpm install` already downloaded at the repo root,
    // instead of mongodb-memory-server downloading a second copy into the user cache.
    env: { MONGOMS_DOWNLOAD_DIR: fileURLToPath(new URL("../../node_modules/.cache/mongodb-memory-server", import.meta.url)) },
    // Test files that start an in-memory MongoDB run one after another: started together they raced to download
    // the same binary and CI failed at random (ENOENT on the .tgz.downloading file).
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
