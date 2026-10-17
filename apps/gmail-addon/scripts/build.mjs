// Bundles the add-on (and the @c16/core engine) into one Apps Script file: dist/Code.js + dist/appsscript.json.
import { build } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const here = new URL("../", import.meta.url);
const exported = [...readFileSync(new URL("src/main.ts", here), "utf8").matchAll(/export \{([^}]+)\}/g)].flatMap((m) => m[1].split(",").map((s) => s.trim()).filter(Boolean));

// Apps Script's V8 may lack some newer built-ins the engine uses.
const banner = `if (!Array.prototype.at) { Object.defineProperty(Array.prototype, "at", { value: function (n) { n = Math.trunc(n) || 0; if (n < 0) n += this.length; return this[n]; }, writable: true, configurable: true }); }
if (!String.prototype.at) { Object.defineProperty(String.prototype, "at", { value: function (n) { n = Math.trunc(n) || 0; if (n < 0) n += this.length; return this[n]; }, writable: true, configurable: true }); }`;

mkdirSync(new URL("dist", here), { recursive: true });
const out = new URL("dist/Code.js", here).pathname.replace(/^\/([A-Za-z]:)/, "$1");
await build({ entryPoints: [new URL("src/main.ts", here).pathname.replace(/^\/([A-Za-z]:)/, "$1")], bundle: true, format: "iife", globalName: "TD", target: "es2019", platform: "neutral", mainFields: ["module", "main"], banner: { js: banner }, outfile: out, logLevel: "warning" });
// Apps Script finds triggers and card actions by top-level function name.
const stubs = exported.map((name) => `function ${name}(e) { return TD.${name}(e); }`).join("\n");
writeFileSync(out, `${readFileSync(out, "utf8")}\n${stubs}\n`);
copyFileSync(new URL("appsscript.json", here), new URL("dist/appsscript.json", here));
console.log(`built dist/Code.js (${Math.round(readFileSync(out).length / 1024)} KB) with ${exported.length} entry points: ${exported.join(", ")}`);
