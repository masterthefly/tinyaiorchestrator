import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { classify as rules, hybrid } from "../src/incident/classifier.ts";
import { triage } from "../src/incident/team.ts";
import { makeTrainingData } from "../src/data/log-data.ts";
import { scoreClassifier } from "../src/eval/classifier-eval.ts";
import { createClassifier, createModelClassifier } from "../src/model/model-classifier.ts";
import { generateSampleLog } from "../src/sample-log.ts";
import { loadSession, loadTextModel } from "../scripts/load-model.mjs";
import { attention_for_text } from "../web/vendor/tlm/tlm_wasm.js";

// These run the real shipped model. They guard the contract between the prompt format and the model:
// change logPrompt without retraining and these fail. The floors are deliberately modest: they catch a
// broken pipeline, they do not pin a number that moves whenever the model is retrained.
const available = existsSync("web/model/model.safetensors");
const tests = available ? JSON.parse(readFileSync("data/log-eval.json", "utf8")) : [];

test("the model learned the wordings it trained on", { skip: !available }, () => {
  const m = createModelClassifier(loadTextModel());
  assert.ok(scoreClassifier(m.classify, tests).seen.right / scoreClassifier(m.classify, tests).seen.total >= 0.95);
  assert.equal(m.stats().unreadable, 0, "the model should always write a readable label");
});

test("on wordings it never saw it does better than guessing, but not by magic", { skip: !available }, () => {
  const s = scoreClassifier(createModelClassifier(loadTextModel()).classify, tests);
  assert.ok(s.new.right / s.new.total >= 0.35, `new wordings: ${s.new.right}/${s.new.total}`);
  assert.ok(s.wild.right / s.wild.total >= 0.65, `wild: ${s.wild.right}/${s.wild.total}`);
});

test("the hybrid is at least as good as the rules on the real world style lines", { skip: !available }, () => {
  const m = createModelClassifier(loadTextModel());
  const r = scoreClassifier(rules, tests).wild;
  const h = scoreClassifier(hybrid(m.classify), tests).wild;
  assert.ok(h.right >= r.right, `hybrid ${h.right} vs rules ${r.right}`);
});

test("the model reports a confidence between 0 and 1 for every answer", { skip: !available }, () => {
  const m = createModelClassifier(loadTextModel());
  for (const t of tests.slice(0, 30)) {
    const c = m.detail(t.message).confidence;
    assert.ok(c !== undefined && c >= 0 && c <= 1, `${t.message}: ${c}`);
  }
});

test("every training example fits in the 64 token window, counted with the real tokenizer", { skip: !available }, () => {
  const session = loadSession();
  // ALL of them: a sample once missed the two rare examples that were too long, and the trainer drops those silently.
  let longest = 0;
  const tooLong: string[] = [];
  for (const row of makeTrainingData()) {
    const prompt = JSON.parse(attention_for_text(session, row.prompt));
    const response = JSON.parse(attention_for_text(session, row.response + "<|endoftext|>"));
    const tokens = prompt.tokens.length + response.tokens.length;
    longest = Math.max(longest, tokens);
    if (prompt.truncated || response.truncated || tokens > 65) tooLong.push(`${tokens} tokens: ${row.prompt.replaceAll("\n", " | ")}`);
  }
  assert.deepEqual(tooLong, [], `the trainer would silently drop these (longest ${longest})`);
});

test("a mention of a path does not make an error a disk error (a bug the first model had)", { skip: !available }, () => {
  // The first model learned "path" means disk, because only disk examples mentioned paths. These are not disk errors.
  const m = createModelClassifier(loadTextModel());
  const notDisk = [
    "503 Service Unavailable from checkout (path=/checkout, req=a1b2c3d4)",
    "upstream payments-api returned 502 Bad Gateway for order 18734 (path=/api/v1/orders)",
    "request timed out after 3000ms (path=/checkout)",
    "invalid token for user 4412 (path=/api/v1/login)",
  ];
  for (const message of notDisk) assert.notEqual(m.classify(message), "disk", message);
});

test("swapping the classifier does not change what the team finds on the example incident", { skip: !available }, () => {
  const model = loadTextModel();
  const baseline = triage(generateSampleLog());
  for (const kind of ["rules", "model", "hybrid"] as const) {
    const r = triage(generateSampleLog(), undefined, createClassifier(kind, model));
    assert.equal(r.ok, true, kind);
    const [big, small] = r.state.incidents ?? [];
    assert.equal(big.origin.service, "db-primary", kind);
    assert.equal(big.origin.type, "connection", kind);
    assert.deepEqual(big.services, ["db-primary", "payments-api", "checkout", "api-gateway"], kind);
    assert.equal(small.origin.service, "batch-worker", kind);
    assert.equal(r.state.incidents?.length, baseline.state.incidents?.length, kind);
  }
});

test("a model classifier shows up in the trace as a model, not as rules", { skip: !available }, () => {
  const r = triage(generateSampleLog(), undefined, createClassifier("model", loadTextModel()));
  const run = r.trace.find((e) => e.kind === "run" && e.agent === "classifier");
  assert.equal(run?.kind === "run" ? run.how : "", "model");
});
