import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, defaultApprovalPolicy, draftNotifications, pending } from "../src/plan/approval.ts";
import { createVirtualClock } from "../src/plan/clock.ts";
import { createBudget, HANG_MS, type ControlConfig } from "../src/plan/control.ts";
import { runTasks, type Task } from "../src/plan/executor.ts";
import { runTriagePlan, type PlanConfig, type PlanRun } from "../src/plan/triage-plan.ts";
import { generateSampleLog } from "../src/sample-log.ts";

const raw = generateSampleLog();
// 8 reads that wait 100 ms, correlate (instant), and 2 advice tasks that wait 300 ms.
const waiting: PlanConfig = { chunkLines: 12, readLatencyMs: 100, adviseLatencyMs: 300 };

/** Run the sample on the virtual clock, one task at a time so the arithmetic stays simple. */
async function run(control?: ControlConfig, concurrency = 1, approval?: Parameters<typeof runTriagePlan>[2]["approval"]): Promise<PlanRun> {
  const clock = createVirtualClock();
  return clock.run(runTriagePlan(raw, waiting, { concurrency, clock, control, approval }));
}

const retry3 = { maxAttempts: 3, backoffMs: 50 };

test("baseline with no faults: 11 attempts, 15 budget units, 1400 ms", async () => {
  const r = await run();
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 11); // 8 reads + 1 correlate + 2 advise
  assert.equal(r.retries, 0);
  assert.equal(r.unitsSpent, 15); // 8*1 + 1 + 2*3
  assert.equal(r.wallMs, 1400);
  assert.deepEqual(r.degraded, []);
});

test("a flaky read with no retry loses that chunk: the run finishes, but the answer is worse", async () => {
  const baseline = await run();
  const r = await run({ faults: [{ stage: "read", match: "read:3", kind: "flaky" }] });
  assert.equal(r.ok, true);
  assert.equal(r.degraded.length, 1);
  assert.match(r.degraded[0], /read chunk 3 was lost \(12 lines\)/);
  assert.ok((r.state.events?.length ?? 0) < (baseline.state.events?.length ?? 0));
});

test("a retry rescues a flaky read and the answer comes out identical", async () => {
  const baseline = await run();
  const r = await run({ retry: retry3, faults: [{ stage: "read", match: "read:3", kind: "flaky" }] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.degraded, []);
  assert.deepEqual(r.state.incidents, baseline.state.incidents);
  assert.equal(r.attempts, 12);
  assert.equal(r.retries, 1);
  assert.equal(r.unitsSpent, 16); // one extra read
  assert.equal(r.wallMs, 1550); // 1400 + the failed 100 ms attempt + a 50 ms backoff
});

test("each attempt is its own span, so a retry shows as a red bar then a green one", async () => {
  const r = await run({ retry: retry3, faults: [{ stage: "read", match: "read:3", kind: "flaky" }] });
  const spans = r.spans.filter((s) => s.taskId === "read:3");
  assert.deepEqual(spans.map((s) => [s.attempt, s.ok]), [[1, false], [2, true]]);
});

test("a permanent crash is not retried, because retrying a bug only wastes money", async () => {
  const r = await run({ retry: retry3, faults: [{ stage: "read", match: "read:3", kind: "crash" }] });
  assert.equal(r.attempts, 11); // read:3 tried once
  assert.equal(r.unitsSpent, 15);
  assert.equal(r.degraded.length, 1);
});

test("retrying a permanent failure anyway burns budget for nothing", async () => {
  const r = await run({ retry: { ...retry3, retryPermanent: true }, faults: [{ stage: "read", match: "read:3", kind: "crash" }] });
  assert.equal(r.attempts, 13); // read:3 tried three times
  assert.equal(r.unitsSpent, 17); // two wasted units
  assert.equal(r.wallMs, 1750); // 1400 + two more 100 ms attempts + backoffs of 50 and 100
  assert.equal(r.degraded.length, 1); // and it still failed
});

test("a hung call with a timeout and retries ends in a fallback, at a known cost", async () => {
  const r = await run({ timeoutMs: 500, retry: retry3, faults: [{ stage: "advise", match: "advise:I1", kind: "hang" }] });
  assert.equal(r.ok, true);
  // reads 800 + advise I1 (500 + 50 + 500 + 100 + 500) + advise I2 300
  assert.equal(r.wallMs, 2750);
  assert.equal(r.attempts, 13);
  assert.equal(r.unitsSpent, 21); // 8 + 1 + three advise attempts of 3 + one of 3
  const [i1, i2] = r.state.incidents ?? [];
  assert.equal(i1.advice?.source, "fallback");
  assert.equal(i2.advice?.source, "advisor");
  assert.match(i1.advice?.text ?? "", /Escalate to the on call engineer/);
  assert.match(r.degraded[0], /I1 got generic fallback advice/);
});

test("with no timeout, one hung call holds the whole run hostage", async () => {
  const r = await run({ faults: [{ stage: "advise", match: "advise:I1", kind: "hang" }] });
  assert.equal(r.wallMs, 800 + HANG_MS + 300);
});

test("a timeout also cuts off a call that is merely slow, which is the price of having one", async () => {
  const slow = { stage: "advise", match: "advise:I1", kind: "slow" as const, extraMs: 400 };
  const patient = await run({ faults: [slow] });
  assert.equal(patient.wallMs, 1800); // 800 + 700 + 300
  assert.deepEqual(patient.degraded, []);

  const impatient = await run({ timeoutMs: 500, faults: [slow] });
  assert.equal(impatient.state.incidents?.[0].advice?.source, "fallback"); // healthy but slow, and lost
});

test("without the fallback, a failed advice leaves the incident bare and says so", async () => {
  const r = await run({ fallback: false, faults: [{ stage: "advise", match: "advise:I1", kind: "crash" }] });
  assert.equal(r.state.incidents?.[0].advice, undefined);
  assert.deepEqual(r.degraded, ["I1 has no advice"]);
});

test("a budget stops spending: work that does not fit is never started", async () => {
  const r = await run({ budget: createBudget(10) });
  assert.equal(r.unitsSpent, 9); // 8 reads + correlate, then advise (3 units) does not fit
  assert.equal(r.attempts, 9);
  assert.equal(r.wallMs, 800);
  assert.equal(r.degraded.length, 2);
  assert.ok(r.spans.some((s) => s.note === "budget"));
  assert.equal(r.maxUnits, 10);
});

test("a budget can starve a stage that mattered more: retries ate the money correlate needed", async () => {
  const r = await run({
    budget: createBudget(12),
    retry: { maxAttempts: 5, backoffMs: 0, retryPermanent: true },
    faults: [{ stage: "read", match: "read:3", kind: "crash" }],
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /correlate failed: budget exhausted/);
  assert.match(r.message, /Nothing can be advised without it/);
});

test("a failed correlate is fatal, because nothing downstream can work without it", async () => {
  const r = await run({ faults: [{ stage: "correlate", match: "*", kind: "crash" }] });
  assert.equal(r.ok, false);
  assert.match(r.message, /correlate failed: .*crashed/);
  assert.equal(r.spans.some((s) => s.stage === "advise"), false);
});

test("retries rescue flaky work side by side too, with the same answer", async () => {
  const baseline = await run();
  const r = await run({ retry: retry3, faults: [{ stage: "read", match: "*", kind: "flaky" }] }, 4);
  assert.deepEqual(r.state.incidents, baseline.state.incidents);
  assert.equal(r.retries, 8); // every read failed once
});

test("the executor reports exactly what happened to a task that failed and recovered", async () => {
  const clock = createVirtualClock();
  const t: Task<string> = { id: "x", label: "x", latencyMs: 10, work: () => "done" };
  const [res] = await clock.run(runTasks("s", [t], 1, clock, { retry: retry3, faults: [{ stage: "s", match: "x", kind: "flaky", failFirst: 2 }] }));
  assert.equal(res.ok, true);
  assert.equal(res.attempts.length, 3);
  assert.equal(clock.now(), 10 + 50 + 10 + 100 + 10); // three 10 ms attempts, with backoffs of 50 and 100
});

// ---- the approval gate ----

test("critical and major messages wait for a person; minor ones go out by themselves", async () => {
  const r = await run();
  const { notifications, sent, audit } = r.approval;
  assert.deepEqual(notifications.map((n) => [n.id, n.severity, n.status]), [["N-I1", "critical", "pending_approval"], ["N-I2", "minor", "auto_sent"]]);
  assert.deepEqual(sent.map((n) => n.id), ["N-I2"]); // nothing risky has gone out
  assert.deepEqual(audit.map((a) => a.action), ["drafted", "drafted", "auto_sent"]);
  assert.equal(notifications[0].to, "data platform team");
  assert.match(notifications[0].subject, /^\[CRITICAL\] I1: connection errors starting at db-primary$/);
});

test("approving sends the message and records who decided", async () => {
  const { approval } = await run();
  const after = decide(approval, "N-I1", "approve", "sam", "checked the cascade");
  assert.deepEqual(after.sent.map((n) => n.id), ["N-I2", "N-I1"]);
  assert.equal(pending(after).length, 0);
  const last = after.audit.at(-1)!;
  assert.deepEqual([last.actor, last.action, last.target, last.detail], ["sam", "approved", "N-I1", "checked the cascade"]);
});

test("rejecting keeps the message from ever being sent", async () => {
  const { approval } = await run();
  const after = decide(approval, "N-I1", "reject", "sam");
  assert.deepEqual(after.sent.map((n) => n.id), ["N-I2"]);
  assert.equal(after.notifications[0].status, "rejected");
  assert.equal(after.audit.at(-1)?.action, "rejected");
});

test("the audit log says approved and rejected in plain English", async () => {
  const { approval } = await run();
  assert.equal(decide(approval, "N-I1", "approve", "sam").audit.at(-1)?.detail, "approved by sam");
  assert.equal(decide(approval, "N-I1", "reject", "sam").audit.at(-1)?.detail, "rejected by sam");
});

test("losing data changes the answer, and the message the team would send says so", async () => {
  const normal = await run();
  const degraded = await run({ faults: [{ stage: "read", match: "read:3", kind: "flaky" }] });
  // The lost chunk held the first errors, so the origin quietly moves. That is why the caveat matters.
  assert.equal(normal.state.incidents?.[0].origin.service, "db-primary");
  assert.notEqual(degraded.state.incidents?.[0].origin.service, "db-primary");
  assert.doesNotMatch(normal.approval.notifications[0].body, /CAUTION/);
  assert.match(degraded.approval.notifications[0].body, /CAUTION: this report is based on incomplete or degraded data \(1 problem\)/);
});

test("a generic fallback is labelled as one inside the message", async () => {
  const r = await run({ timeoutMs: 500, faults: [{ stage: "advise", match: "advise:I1", kind: "hang" }] });
  assert.match(r.approval.notifications[0].body, /generic fallback, not a real runbook/);
});

test("an incident whose advice failed still produces a message: a critical one must never vanish", async () => {
  const r = await run({ fallback: false, faults: [{ stage: "advise", match: "advise:I1", kind: "crash" }] });
  assert.equal(r.state.incidents?.[0].advice, undefined);
  const n = r.approval.notifications[0];
  assert.equal(n.id, "N-I1");
  assert.equal(n.to, "the on call engineer");
  assert.equal(n.status, "pending_approval"); // and it still waits for a person
  assert.match(n.body, /No advice could be produced/);
});

test("a decision cannot be made twice, and an unknown message is refused", async () => {
  const { approval } = await run();
  const once = decide(approval, "N-I1", "approve", "sam");
  assert.throws(() => decide(once, "N-I1", "reject", "sam"), /already sent/);
  assert.throws(() => decide(approval, "N-ghost", "approve", "sam"), /no notification/);
});

test("deciding does not change the state it was given", async () => {
  const { approval } = await run();
  const before = JSON.stringify(approval);
  decide(approval, "N-I1", "approve", "sam");
  assert.equal(JSON.stringify(approval), before);
});

test("the policy decides what is risky: require nothing, or require everything", async () => {
  const r = await run();
  const incidents = r.state.incidents ?? [];
  assert.equal(draftNotifications(incidents, { requireFor: [] }).sent.length, 2);
  const strict = draftNotifications(incidents, { requireFor: ["critical", "major", "minor"] });
  assert.equal(strict.sent.length, 0);
  assert.equal(pending(strict).length, 2);
  assert.deepEqual(defaultApprovalPolicy.requireFor, ["critical", "major"]);
});

test("fallback advice still produces a message, for the default owner", async () => {
  const r = await run({ timeoutMs: 500, faults: [{ stage: "advise", match: "advise:I1", kind: "hang" }] });
  assert.equal(r.approval.notifications[0].to, "the on call engineer");
});

test("a classifier that crashes is a failure the plan names, not unreadable input", async () => {
  const broken = { name: "classifier", description: "always crashes", kind: "model" as const, run: () => { throw new Error("model exploded"); } };
  const clock = createVirtualClock();
  const r = await clock.run(runTriagePlan(raw, { ...waiting, classifier: broken }, { concurrency: 1, clock }));
  assert.equal(r.ok, false, "with every read lost there is nothing to report");
  assert.ok(r.warnings.some((w) => w.includes("model exploded")), "the real error must be in the warnings: " + r.warnings.join(" | "));
  assert.ok(r.degraded.some((d) => d.includes("was lost")), "and the lost chunks must be reported");
});
