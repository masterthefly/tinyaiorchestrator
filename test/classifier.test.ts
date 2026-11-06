import { test } from "node:test";
import assert from "node:assert/strict";
import { classify as rules, createClassifierAgent, hybrid } from "../src/incident/classifier.ts";
import { newCase, type LogEvent } from "../src/incident/types.ts";
import { ERROR_TYPES, logPrompt, parseType } from "../src/model/log-prompt.ts";
import { createClassifier, createModelClassifier } from "../src/model/model-classifier.ts";
import type { TextModel } from "../src/model/text-model.ts";
import { wilson } from "../src/eval/classifier-eval.ts";

/** A model that answers from a table, counts its calls, and can report a fixed confidence. */
function fake(table: Record<string, string>, confidence?: (answer: string) => number) {
  const asked: string[] = [];
  const model: TextModel = {
    answer: (prompt) => {
      asked.push(prompt);
      return table[prompt] ?? " garbage";
    },
    ...(confidence ? { confidence: (_p, a) => confidence(a) } : {}),
  };
  return { model, asked };
}

test("the prompt blanks out numbers and ids, and is cut to fit the model's window", () => {
  assert.equal(logPrompt("Timeout connecting to db after 30s (req=a1b2c3d4)"), "Log: Timeout connecting to db after #s (req=#)\nType:");
  const long = logPrompt("x".repeat(500));
  assert.ok(long.length <= "Log: ".length + 80 + "\nType:".length);
  assert.ok(long.endsWith("\nType:"));
});

test("the answer is read back into a known label, or rejected", () => {
  assert.equal(parseType(" timeout"), "timeout");
  assert.equal(parseType("rate_limit extra words"), "rate_limit");
  for (const bad of ["", "  ", "banana", "Timeout"]) assert.equal(parseType(bad), null, JSON.stringify(bad));
  assert.equal(ERROR_TYPES.length, 9);
});

test("the model classifier turns the model's word into a label", () => {
  const { model } = fake({ [logPrompt("disk is full")]: " disk" });
  assert.equal(createModelClassifier(model).classify("disk is full"), "disk");
});

test("an unreadable answer becomes unknown and is counted, never guessed", () => {
  const m = createModelClassifier(fake({}).model);
  assert.equal(m.classify("something odd"), "unknown");
  assert.equal(m.stats().unreadable, 1);
});

test("messages that differ only in numbers cost one model call", () => {
  const { model, asked } = fake({ [logPrompt("timeout after 30s")]: " timeout" });
  const m = createModelClassifier(model);
  for (const msg of ["timeout after 30s", "timeout after 45s", "timeout after 7s"]) assert.equal(m.classify(msg), "timeout");
  assert.equal(asked.length, 1);
  assert.deepEqual([m.stats().calls, m.stats().cached], [1, 2]);
});

test("the model can abstain when it is not sure enough, and says so", () => {
  const { model } = fake({ [logPrompt("disk is full")]: " disk" }, () => 0.6);
  assert.equal(createModelClassifier(model, { minConfidence: 0.9 }).classify("disk is full"), "unknown");
  assert.equal(createModelClassifier(model, { minConfidence: 0.5 }).classify("disk is full"), "disk");
  const m = createModelClassifier(model, { minConfidence: 0.9 });
  m.classify("disk is full");
  assert.equal(m.stats().abstained, 1);
});

test("a model that cannot report confidence never abstains", () => {
  const { model } = fake({ [logPrompt("disk is full")]: " disk" });
  assert.equal(createModelClassifier(model, { minConfidence: 0.99 }).classify("disk is full"), "disk");
});

test("the hybrid asks the model only when the rules have no answer", () => {
  const { model, asked } = fake({ [logPrompt("the pipe burst")]: " exception" });
  const h = hybrid(createModelClassifier(model).classify);
  assert.equal(h("No space left on device"), "disk"); // the rules knew
  assert.equal(asked.length, 0);
  assert.equal(h("the pipe burst"), "exception"); // the rules did not, so the model was asked
  assert.equal(asked.length, 1);
});

test("rules still say unknown for wordings they have no pattern for", () => {
  assert.equal(rules("JWT signature could not be verified"), "unknown");
  assert.equal(rules("Out of memory: killed process"), "memory");
});

test("every kind of classifier is just an agent, and the model ones say so in the trace", () => {
  const { model } = fake({});
  const kinds = (["rules", "model", "hybrid"] as const).map((k) => createClassifier(k, model).kind);
  assert.deepEqual(kinds, ["rules", "model", "model"]);
  assert.throws(() => createClassifier("model"), /needs a model/);
});

test("a classifier agent labels warnings and errors and leaves info lines alone", () => {
  const agent = createClassifierAgent(() => "disk");
  const events: LogEvent[] = [
    { time: 1, service: "a", level: "info", message: "hello" },
    { time: 2, service: "a", level: "warn", message: "x" },
    { time: 3, service: "a", level: "error", message: "y" },
  ];
  const out = agent.run({ ...newCase(""), events }).state.events!;
  assert.deepEqual(out.map((e) => e.type), [undefined, "disk", "disk"]);
});

test("the range around a score is wide when there are few test lines", () => {
  const [lo12, hi12] = wilson(9, 12);
  const [lo74, hi74] = wilson(51, 74);
  assert.ok(hi12 - lo12 > 0.4);
  assert.ok(hi74 - lo74 < 0.25);
  assert.deepEqual(wilson(0, 0), [0, 0]);
});
