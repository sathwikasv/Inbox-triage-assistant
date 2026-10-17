// Builds the whole app for Vercel (Build Output API v3) into .vercel/output, then `vercel deploy --prebuilt`.
//   static/          the web app (Vite build, with VITE_API_URL=/api so the server is on the same domain)
//   functions/api    the Express server bundled into one file, plus the two data files it reads at start-up
// Public VITE_ IDs come from the repo-root .env; server secrets are set in the Vercel project, never built in.
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = `${root}.vercel/output`;
const run = (cmd, env = {}) => execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });

rmSync(out, { recursive: true, force: true });
run("pnpm --filter @c16/core build");
run("pnpm --filter web build", { VITE_API_URL: "/api" });
cpSync(`${root}apps/web/dist`, `${out}/static`, { recursive: true });

// The server's modules read ../../../../data/... relative to their own file, so the bundle sits four folders deep.
const fn = `${out}/functions/api.func`;
const nested = "srv/apps/api/dist";
mkdirSync(`${fn}/${nested}`, { recursive: true });
const optional = ["kerberos", "@mongodb-js/zstd", "@aws-sdk/credential-providers", "gcp-metadata", "snappy", "aws4", "mongodb-client-encryption", "bson-ext"];
run(
  [
    `pnpm --filter api exec esbuild src/vercel.ts --bundle --platform=node --target=node20 --format=esm`,
    `--outfile="${fn}/${nested}/index.mjs"`,
    ...optional.map((p) => `--external:${p}`),
    `--banner:js="import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);"`,
    "--log-level=warning",
  ].join(" "),
);
for (const f of ["data/fixture/C16/fixture.json", "data/labels/C16_labels.json"]) cpSync(`${root}${f}`, `${fn}/${f}`);
writeFileSync(`${fn}/.vc-config.json`, JSON.stringify({ runtime: "nodejs20.x", handler: `${nested}/index.mjs`, launcherType: "Nodejs", shouldAddHelpers: false, maxDuration: 60 }, null, 2));

writeFileSync(
  `${out}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "^/api(?:/(.*))?$", dest: "/api?__path=$1" },
        { handle: "filesystem" },
        { src: "^/(.*)$", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);
console.log(`\nBuilt ${out}`);
