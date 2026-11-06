// Writes the log classifier's training data and its test sets to data/.
//   node scripts/make-log-data.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { makeTestSets, makeTrainingData } from "../src/data/log-data.ts";

mkdirSync("data", { recursive: true });

const train = makeTrainingData();
writeFileSync("data/log-train.jsonl", train.map((e) => JSON.stringify(e)).join("\n") + "\n");

const tests = makeTestSets();
writeFileSync("data/log-eval.json", JSON.stringify(tests, null, 1) + "\n");

const by = (set) => tests.filter((t) => t.set === set).length;
const longest = Math.max(...train.map((e) => (e.prompt + e.response).length));
console.log(`training examples: ${train.length} (longest ${longest} characters)`);
console.log(`test sets: seen ${by("seen")}, new wordings ${by("new")}, wild ${by("wild")}`);
console.log("\nA few training examples:");
for (const e of train.slice(0, 5)) console.log(JSON.stringify(e));
