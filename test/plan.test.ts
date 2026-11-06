import { test } from "node:test";
import assert from "node:assert/strict";
import { createVirtualClock, realClock } from "../src/plan/clock.ts";
import { runTasks, type Task } from "../src/plan/executor.ts";
import { describePlan, defaultPlanConfig, runTriagePlan, splitIntoChunks, type PlanConfig } from "../src/plan/triage-plan.ts";
import { triage } from "../src/incident/team.ts";
import { generateSampleLog } from "../src/sample-log.ts";

const task = (id: string, latencyMs: number, value = id): Task<string> => ({ id, label: id, latencyMs, work: () => value });

test("the virtual clock lets a test wait 300 ms without waiting", async () => {
  const clock = createVirtualClock();
  const t = Date.now();
  await clock.run(clock.sleep(300));
  assert.equal(clock.now(), 300);
  assert.ok(Date.now() - t < 200, "virtual time must not cost real time");
});

test("one at a time, the finish time is the sum of the waits", async () => {
  const clock = createVirtualClock();
  const results = await clock.run(runTasks("s", [task("a", 100), task("b", 100), task("c", 100)], 1, clock));
  assert.equal(clock.now(), 300);
  // and the spans never overlap
  const spans = results.map((r) => r.span).sort((x, y) => x.start - y.start);
  for (let i = 1; i < spans.length; i++) assert.ok(spans[i].start >= spans[i - 1].end);
});

test("side by side, the finish time is the longest wait of each wave", async () => {
  const clock = createVirtualClock();
  await clock.run(runTasks("s", Array.from({ length: 8 }, (_, i) => task(`t${i}`, 100)), 4, clock));
  assert.equal(clock.now(), 200); // 8 tasks, 4 at a time: two waves of 100
});

test("more lanes than tasks changes nothing", async () => {
  const clock = createVirtualClock();
  await clock.run(runTasks("s", [task("a", 100), task("b", 100)], 50, clock));
  assert.equal(clock.now(), 100);
});

test("results keep the order the tasks were given, however they finish", async () => {
  const clock = createVirtualClock();
  const results = await clock.run(runTasks("s", [task("slow", 300), task("fast", 10), task("mid", 100)], 3, clock));
  assert.deepEqual(results.map((r) => r.value), ["slow", "fast", "mid"]);
});

test("a task that throws is recorded and does not stop the others", async () => {
  const clock = createVirtualClock();
  const boom: Task<string> = { id: "boom", label: "boom", latencyMs: 10, work: () => { throw new Error("it broke"); } };
  const results = await clock.run(runTasks("s", [task("a", 10), boom, task("c", 10)], 2, clock));
  assert.deepEqual(results.map((r) => r.ok), [true, false, true]);
  assert.equal(results[1].error, "it broke");
});

test("a task with no waiting takes no time, so extra lanes have nothing to overlap", async () => {
  const clock = createVirtualClock();
  const results = await clock.run(runTasks("s", [task("a", 0), task("b", 0), task("c", 0)], 4, clock));
  assert.equal(clock.now(), 0);
  assert.ok(results.every((r) => r.span.end === r.span.start));
});

test("with the real clock a pure computation also finishes at once, however many lanes", async () => {
  const before = realClock.now();
  await runTasks("s", [task("a", 0), task("b", 0), task("c", 0)], 4, realClock);
  assert.ok(realClock.now() - before < 50);
});

test("the log is cut into chunks of whole lines", () => {
  const raw = Array.from({ length: 25 }, (_, i) => `line ${i}`).join("\n") + "\n\n";
  const chunks = splitIntoChunks(raw, 10);
  assert.deepEqual(chunks.map((c) => c.split("\n").length), [10, 10, 5]);
  assert.equal(splitIntoChunks("", 10).length, 0);
});

test("the plan is described in plain words before it runs", () => {
  const lines = describePlan(generateSampleLog(), { ...defaultPlanConfig, readLatencyMs: 100 });
  assert.match(lines[0], /^read: 8 tasks, one per chunk of up to 12 lines \(each waits 100 ms\)$/);
  assert.match(lines[2], /1 task, because it needs every event/);
});

const raw = generateSampleLog();

test("a planned run gives exactly the same answer as the step 1 team", async () => {
  const planned = await runTriagePlan(raw, defaultPlanConfig, { concurrency: 1 });
  const original = triage(raw);
  assert.equal(planned.ok, true);
  assert.deepEqual(planned.state.events, original.state.events);
  assert.deepEqual(planned.state.incidents, original.state.incidents);
  assert.equal(planned.state.unparsedLines, original.state.unparsedLines);
});

test("running in parallel does not change the answer, whatever the chunk size", async () => {
  const baseline = await runTriagePlan(raw, defaultPlanConfig, { concurrency: 1 });
  for (const chunkLines of [1, 7, 12, 50, 500]) {
    const run = await runTriagePlan(raw, { ...defaultPlanConfig, chunkLines }, { concurrency: 6 });
    assert.deepEqual(run.state.incidents, baseline.state.incidents, `chunk size ${chunkLines}`);
  }
});

const waiting: PlanConfig = { chunkLines: 12, readLatencyMs: 100, adviseLatencyMs: 300 };

test("with waiting, one at a time costs every wait added up", async () => {
  const clock = createVirtualClock();
  const run = await clock.run(runTriagePlan(raw, waiting, { concurrency: 1, clock }));
  // 8 reads x 100 + correlate 0 + 2 advises x 300
  assert.equal(run.wallMs, 1400);
  assert.equal(run.workMs, 1400);
});

test("with waiting, parallel is faster, and the work done is the same", async () => {
  const clock = createVirtualClock();
  const run = await clock.run(runTriagePlan(raw, waiting, { concurrency: 4, clock }));
  // reads: 2 waves of 100; correlate: 0; advises: both at once, 300
  assert.equal(run.wallMs, 500);
  assert.equal(run.workMs, 1400);
});

test("no amount of parallelism beats the critical path, because correlate is one task", async () => {
  const clock = createVirtualClock();
  const run = await clock.run(runTriagePlan(raw, waiting, { concurrency: 1000, clock }));
  assert.equal(run.wallMs, 400); // one read wave (100) + the advise wave (300)
  assert.equal(run.criticalPathMs, 400);
});

test("without any waiting, parallel saves nothing", async () => {
  const clock = createVirtualClock();
  const seq = await clock.run(runTriagePlan(raw, defaultPlanConfig, { concurrency: 1, clock }));
  const par = await clock.run(runTriagePlan(raw, defaultPlanConfig, { concurrency: 8, clock }));
  assert.equal(seq.wallMs, 0);
  assert.equal(par.wallMs, 0);
});

test("a chunk of pure junk is counted as unreadable but does not stop the run", async () => {
  const junkFirst = "junk one\njunk two\njunk three\n" + raw;
  const run = await runTriagePlan(junkFirst, { ...defaultPlanConfig, chunkLines: 3 }, { concurrency: 2 });
  assert.equal(run.ok, true);
  assert.equal(run.state.unparsedLines, 6); // the 3 new junk lines plus the 3 already in the sample
  assert.equal(run.state.incidents?.length, 2);
});

test("a log with nothing readable fails clearly", async () => {
  const run = await runTriagePlan("hello\nthere\n", defaultPlanConfig, { concurrency: 2 });
  assert.equal(run.ok, false);
  assert.match(run.message, /no line could be read/);
});

test("a quiet log plans no advise tasks at all", async () => {
  const run = await runTriagePlan("2026-11-06T09:00:00Z svc INFO ok\n2026-11-06T09:00:05Z svc INFO ok\n", waiting, { concurrency: 4 });
  assert.equal(run.ok, true);
  assert.equal(run.spans.some((s) => s.stage === "advise"), false);
});
