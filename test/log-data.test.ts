import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestSets, makeTrainingData } from "../src/data/log-data.ts";
import { HELDOUT, TRAIN } from "../src/data/log-templates.ts";
import { WILD } from "../src/data/wild-logs.ts";
import { ERROR_TYPES, logPrompt } from "../src/model/log-prompt.ts";

test("the training data is the same every time it is built", () => {
  assert.deepEqual(makeTrainingData(), makeTrainingData());
  assert.deepEqual(makeTestSets(), makeTestSets());
});

test("training covers every kind of problem, none of them starved", () => {
  const counts = new Map<string, number>();
  for (const e of makeTrainingData()) counts.set(e.response.trim(), (counts.get(e.response.trim()) ?? 0) + 1);
  assert.deepEqual([...counts.keys()].sort(), [...ERROR_TYPES].sort());
  for (const [type, n] of counts) assert.ok(n >= 80, `${type} has only ${n} examples`);
});

test("key=value decorations appear in every class, so no word predicts one class", () => {
  // Without this the model learns "path" means disk. Every kind of problem must mention a path sometimes.
  const counts = new Map<string, number>();
  for (const e of makeTrainingData()) if (e.prompt.includes("path=")) counts.set(e.response.trim(), (counts.get(e.response.trim()) ?? 0) + 1);
  for (const type of ERROR_TYPES) assert.ok((counts.get(type) ?? 0) >= 10, `only ${counts.get(type) ?? 0} "${type}" examples mention path=`);
});

test("every training example is short enough for the model's 64 token window", () => {
  // 150 characters is a safe stand in: the trainer drops longer examples without telling you,
  // and test/model.test.ts counts real tokens.
  for (const e of makeTrainingData()) assert.ok((e.prompt + e.response).length <= 150, e.prompt);
});

test("no test line appears in the training data, once normalised", () => {
  const trained = new Set(makeTrainingData().map((e) => e.prompt));
  const leaked = makeTestSets().filter((t) => trained.has(logPrompt(t.message)));
  assert.deepEqual(leaked.map((t) => t.message), []);
});

test("the held out wordings really are different wordings from the ones trained on", () => {
  const trained = new Set(Object.values(TRAIN).flat());
  for (const type of ERROR_TYPES) {
    for (const t of HELDOUT[type]) assert.ok(!trained.has(t), `"${t}" appears in both`);
    assert.equal(HELDOUT[type].length, 5);
  }
});

test("the three test sets all exist and cover every kind of problem", () => {
  const tests = makeTestSets();
  for (const set of ["seen", "new", "wild"] as const) {
    const types = new Set(tests.filter((t) => t.set === set).map((t) => t.type));
    assert.equal(types.size, ERROR_TYPES.length, `${set} is missing a type`);
  }
  assert.equal(tests.filter((t) => t.set === "wild").length, WILD.length);
});

test("the wild lines are used for testing only", () => {
  const wild = new Set(WILD.map(([m]) => m));
  for (const m of Object.values(TRAIN).flat()) assert.ok(!wild.has(m));
  const trainedPrompts = new Set(makeTrainingData().map((e) => e.prompt));
  for (const [m] of WILD) assert.ok(!trainedPrompts.has(logPrompt(m)), m);
});
