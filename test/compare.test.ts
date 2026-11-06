import { test } from "node:test";
import assert from "node:assert/strict";
import { codeLines, compareAnswers, compareFailure, compareSpeed } from "../src/compare/compare.ts";
import { lookupAdvice, triageMonolith, triageMonolithDefended } from "../src/compare/monolith.ts";
import { generateSampleLog } from "../src/sample-log.ts";

const raw = generateSampleLog();

test("the single function finds exactly what the team finds", () => {
  const a = compareAnswers(raw);
  assert.equal(a.same, true, a.firstDifference);
  assert.equal(a.incidents, 2);
});

test("they also agree when the classifier is swapped, because both take the same classifier", () => {
  const everythingIsATimeout = () => "timeout" as const;
  const a = compareAnswers(raw, everythingIsATimeout);
  assert.equal(a.same, true, a.firstDifference);
});

test("the defended single function gives the same answer as the plain one when nothing breaks", () => {
  const plain = triageMonolith(raw);
  const defended = triageMonolithDefended(raw);
  assert.deepEqual(defended.incidents, plain.incidents);
  assert.deepEqual(defended.problems, []);
});

test("the single function's advice names the origin, the owner and the first three runbook steps", () => {
  const [big] = triageMonolith(raw).incidents;
  const advice = lookupAdvice(big, { runbooks: { connection: ["a", "b", "c", "d"] }, owners: { "db-primary": "data-team" }, defaultOwner: "oncall" } as never);
  assert.equal(advice.owner, "data-team");
  assert.match(advice.text, /1\) a 2\) b 3\) c\./);
  assert.ok(!advice.text.includes("d."), "only three steps are quoted");
});

test("when the advisor crashes: the plain function loses everything, the other three keep the incidents", async () => {
  const rows = Object.fromEntries((await compareFailure(raw, "advisor")).map((r) => [r.who, r]));
  assert.equal(rows["single function"].returned, false);
  for (const who of ["single function + try/catch", "team (supervisor)", "team (planner + controls)"]) {
    assert.equal(rows[who].incidents, 2, who);
    assert.equal(rows[who].advised, 0, `${who}: no real advice, only a fallback or nothing`);
  }
});

test("when the classifier crashes: the guarded function still answers, and both teams give up (a weakness, pinned here)", async () => {
  const rows = Object.fromEntries((await compareFailure(raw, "classifier")).map((r) => [r.who, r]));
  assert.equal(rows["single function"].returned, false);
  assert.equal(rows["single function + try/catch"].incidents, 2);
  // The team stops at the failing agent, and the planner loses every read chunk. Neither falls back to
  // unlabelled events the way the guarded function does. If someone fixes that, this test should change with it.
  assert.equal(rows["team (supervisor)"].incidents, 0);
  assert.equal(rows["team (planner + controls)"].incidents, 0);
});

test("nobody fails silently: every implementation either returns the full answer or says something went wrong", async () => {
  for (const broken of ["advisor", "classifier"] as const) {
    for (const r of await compareFailure(raw, broken)) assert.equal(r.saidSo, true, `${r.who} when the ${broken} crashed`);
  }
});

test("the team's bookkeeping on the example is a fixed 15 steps, and the single function has none", () => {
  const s = compareSpeed(raw, 5);
  assert.equal(s.teamSteps, 15);
  assert.ok(s.singleMs > 0 && s.teamMs > 0);
});

test("codeLines ignores blank lines and comments", () => {
  assert.equal(codeLines("// hello\n\nconst a = 1;\n  /* x */\n * y\nconst b = 2;\n"), 2);
});
