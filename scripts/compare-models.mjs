// Compares the first log classifier with the second, on the SAME test sets, each with its own prompt format.
//   node scripts/compare-models.mjs <dir of the first model>
//
// The rules of this comparison were fixed before the results were seen: the winner is chosen by the
// "new wordings" set (the development set). The "wild" set is only reported, never used to choose,
// so it stays an unbiased check.
import { readFileSync } from "node:fs";
import { clearlyDifferent, scoreClassifier } from "../src/eval/classifier-eval.ts";
import { createModelClassifier } from "../src/model/model-classifier.ts";
import { loadTextModel } from "./load-model.mjs";

const firstDir = process.argv[2];
if (!firstDir) throw new Error("usage: node scripts/compare-models.mjs <dir of the first model>");

// The first model was trained on this older prompt: numbers collapsed one by one, cut at 80 characters.
const legacyNormalise = (m) =>
  m.replace(/\b(req|request|trace|id)=[^\s,)]+/gi, "$1=#").replace(/\b(?=[0-9a-f]*\d)[0-9a-f]{6,}\b/gi, "#").replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
const legacyPrompt = (m) => `Log: ${legacyNormalise(m).slice(0, 80)}\nType:`;

const tests = JSON.parse(readFileSync("data/log-eval.json", "utf8"));
const first = createModelClassifier(loadTextModel(firstDir), { prompt: legacyPrompt });
const second = createModelClassifier(loadTextModel("web/model"));
const a = scoreClassifier(first.classify, tests);
const b = scoreClassifier(second.classify, tests);

const pct = (x) => `${Math.round(100 * x)}%`;
console.log("accuracy on the same test lines (plausible range)\n");
for (const set of ["seen", "new", "wild"]) {
  const x = a[set], y = b[set];
  const verdict = clearlyDifferent(x, y) ? `${y.right > x.right ? "second" : "first"} model is clearly ahead` : "cannot tell apart";
  console.log(`${set.padEnd(5)} first ${pct(x.right / x.total)} (${pct(x.low)}-${pct(x.high)})   second ${pct(y.right / y.total)} (${pct(y.low)}-${pct(y.high)})   ${verdict}`);
}

// The specific bug that motivated the change: "path=..." made the first model say "disk".
const probe = ["503 Service Unavailable from checkout (path=/checkout, req=a1b2c3d4)", "upstream payments-api returned 502 Bad Gateway for order 18734 (path=/api/v1/orders)", "request timed out after 3000ms (path=/checkout)", "invalid token for user 4412 (path=/api/v1/login)"];
console.log("\nThe path= probe (messages that are NOT disk errors, but mention a path):");
for (const m of probe) console.log(`  first: ${first.detail(m).type?.padEnd(10)} second: ${second.detail(m).type?.padEnd(10)} ${m}`);
