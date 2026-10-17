// Local MongoDB for development without Atlas: `pnpm --filter api dev:db`, then set
// MONGODB_URI=mongodb://127.0.0.1:27017/c16 in apps/api/.env. Data is lost when it stops.
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.MONGOMS_DOWNLOAD_DIR ??= fileURLToPath(new URL("../../../node_modules/.cache/mongodb-memory-server", import.meta.url));
const port = Number(process.env.DEV_DB_PORT ?? 27017);
const db = await MongoMemoryServer.create({ instance: { port } });
console.log(`dev MongoDB ready: ${db.getUri()}c16  (Ctrl+C to stop)`);
process.on("SIGINT", async () => {
  await db.stop();
  process.exit(0);
});
