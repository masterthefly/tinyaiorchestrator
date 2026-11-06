// Scores the classifiers on the three test sets, and times them.
//   node scripts/eval-classifier.mjs [--show-wrong]
import { readFileSync } from "node:fs";
import { classify as rules, hybrid } from "../src/incident/classifier.ts";
import { clearlyDifferent, scoreClassifier } from "../src/eval/classifier-eval.ts";
import { createModelClassifier } from "../src/model/model-classifier.ts";
import { loadTextModel } from "./load-model.mjs";

const THRESHOLD = 0.99;
const tests = JSON.parse(readFileSync("data/log-eval.json", "utf8"));
const model = loadTextModel();
const plain = createModelClassifier(model);
const careful = createModelClassifier(model, { minConfidence: THRESHOLD });

const contenders = {
  rules,
  model: plain.classify,
  hybrid: hybrid(plain.classify),
  [`model, abstains below ${THRESHOLD * 100}%`]: careful.classify,
  [`hybrid, abstains below ${THRESHOLD * 100}%`]: hybrid(careful.classify),
};
const names = Object.keys(contenders);

const SETS = { seen: "fresh fills of trained wordings", new: "wordings never trained on", wild: "real world style, hand written" };
const scores = Object.fromEntries(names.map((name) => [name, scoreClassifier(contenders[name], tests)]));
const pct = (x) => `${Math.round(100 * x)}%`;

console.log("accuracy, and the range the true accuracy could plausibly be in\n");
for (const [set, label] of Object.entries(SETS)) {
  console.log(`${set} (${scores.rules[set].total} lines): ${label}`);
  for (const name of names) {
    const s = scores[name][set];
    console.log(`   ${name.padEnd(30)} ${pct(s.right / s.total).padStart(4)}  (${pct(s.low)} to ${pct(s.high)})`);
  }
}

console.log("\nIs the difference real? (do the ranges overlap?)");
for (const set of Object.keys(SETS)) {
  for (const [a, b] of [["model", "rules"], ["hybrid", "rules"], ["hybrid", names[4]]]) {
    const x = scores[a][set], y = scores[b][set];
    const lead = x.right / x.total > y.right / y.total ? a : b;
    console.log(`   ${set.padEnd(5)} ${a} vs ${b}: ${clearlyDifferent(x, y) ? `${lead} is clearly ahead` : "cannot tell apart"}`);
  }
}

// Abstaining does not raise the headline accuracy (an "unknown" counts as wrong). Its value is knowing which
// answers to trust, so show the trade: how much it still answers, and how right it is when it does.
console.log("\nIf the model may abstain (new and wild lines together): answers vs accuracy when it answers");
const pool = tests.filter((t) => t.set !== "seen").map((t) => ({ truth: t.type, ...plain.detail(t.message) }));
for (const th of [0, 0.9, 0.99, 0.999]) {
  const answered = pool.filter((x) => (x.confidence ?? 1) >= th);
  const right = answered.filter((x) => x.type === x.truth).length;
  console.log(`   at least ${String(th * 100).padEnd(5)}% sure: answers ${pct(answered.length / pool.length).padStart(4)} of lines, right ${pct(right / Math.max(1, answered.length)).padStart(4)} of those`);
}
const loud = pool.filter((x) => x.type !== x.truth && (x.confidence ?? 0) > 0.99).length;
console.log(`   but ${loud} of its ${pool.filter((x) => x.type !== x.truth).length} wrong answers were given with more than 99% confidence.`);

// How long does a decision take?
function time(fn, rounds) {
  const msgs = tests.map((t) => t.message);
  const t0 = performance.now();
  for (let r = 0; r < rounds; r++) for (const m of msgs) fn(m);
  return ((performance.now() - t0) / (rounds * msgs.length)) * 1000;
}
const coldModel = createModelClassifier(model);
const modelMicros = (() => {
  const msgs = tests.map((t) => t.message);
  const t0 = performance.now();
  for (const m of msgs) coldModel.detail(m);
  return ((performance.now() - t0) / msgs.length) * 1000;
})();
console.log(`\nTime per message: rules ${time(rules, 200).toFixed(1)} microseconds; the model (uncached, with confidence) ${(modelMicros / 1000).toFixed(1)} milliseconds.`);

if (process.argv.includes("--show-wrong")) {
  for (const name of ["rules", "model"]) {
    console.log(`\n${name} got these wrong on the wild set:`);
    for (const w of scores[name].wild.wrong) console.log(`  [${w.truth} -> ${w.said}] ${w.message}`);
  }
}
