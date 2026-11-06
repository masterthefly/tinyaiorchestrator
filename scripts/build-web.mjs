// Turns the TypeScript in src/ into plain JavaScript in web/js/ so a browser can run it.
// No bundler: Node's built in type stripper removes the types, and we point the imports at
// .js instead of .ts. The code you read in src/ is exactly the code the browser runs.
// It also copies the original TypeScript to web/src/, so the page can show it.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join } from "node:path";

process.removeAllListeners("warning"); // hide the "experimental" notice

// Files that use Node only APIs (files, process) are not for the browser.
const SKIP = new Set(["cli.ts", "plan-cli.ts", "chaos-cli.ts", "compare-cli.ts", "node-connectors.ts"]);

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.name.endsWith(".ts")) yield path;
  }
}

rmSync("web/js", { recursive: true, force: true });
rmSync("web/src", { recursive: true, force: true });

let built = 0;
for (const file of walk("src")) {
  const rel = file.slice("src/".length).replaceAll("\\", "/");
  const copy = join("web/src", rel);
  mkdirSync(dirname(copy), { recursive: true });
  copyFileSync(file, copy);

  if (SKIP.has(rel.split("/").at(-1))) continue;
  const js = stripTypeScriptTypes(readFileSync(file, "utf8")).replace(/(from\s+["'][^"']+)\.ts(["'])/g, "$1.js$2");
  const out = join("web/js", rel.replace(/\.ts$/, ".js"));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, js);
  built++;
}
// The classifier test set is scored live in the page, so ship a copy next to it.
mkdirSync("web/data", { recursive: true });
copyFileSync("data/log-eval.json", "web/data/log-eval.json");
console.log(`built ${built} files into web/js, copied the TypeScript to web/src, and the test set to web/data`);
