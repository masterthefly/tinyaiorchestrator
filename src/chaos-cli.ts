import { createVirtualClock } from "./plan/clock.ts";
import { createBudget, type ControlConfig } from "./plan/control.ts";
import { runTriagePlan, type PlanConfig, type PlanRun } from "./plan/triage-plan.ts";
import { generateSampleLog } from "./sample-log.ts";

/**
 * A tour of failure. Each scenario breaks something on purpose and shows what the team did and what
 * it cost. Time is simulated, so this runs instantly and the numbers are exact.
 */
const raw = generateSampleLog();
const config: PlanConfig = { chunkLines: 12, readLatencyMs: 100, adviseLatencyMs: 300 };
const retry = { maxAttempts: 3, backoffMs: 50 };

interface Scenario {
  name: string;
  control: () => ControlConfig; // a function, so each run gets a fresh budget
}

const scenarios: Scenario[] = [
  { name: "Nothing goes wrong", control: () => ({}) },
  { name: "A read blips once, no retry", control: () => ({ faults: [{ stage: "read", match: "read:3", kind: "flaky" }] }) },
  { name: "A read blips once, 3 attempts", control: () => ({ retry, faults: [{ stage: "read", match: "read:3", kind: "flaky" }] }) },
  { name: "A read always crashes, 3 attempts", control: () => ({ retry, faults: [{ stage: "read", match: "read:3", kind: "crash" }] }) },
  { name: "...and we retry bugs too (a mistake)", control: () => ({ retry: { ...retry, retryPermanent: true }, faults: [{ stage: "read", match: "read:3", kind: "crash" }] }) },
  { name: "Advice hangs, no timeout", control: () => ({ faults: [{ stage: "advise", match: "advise:I1", kind: "hang" }] }) },
  { name: "Advice hangs, 500 ms timeout, 3 attempts", control: () => ({ timeoutMs: 500, retry, faults: [{ stage: "advise", match: "advise:I1", kind: "hang" }] }) },
  { name: "Advice is slow (+400 ms), no timeout", control: () => ({ faults: [{ stage: "advise", match: "advise:I1", kind: "slow", extraMs: 400 }] }) },
  { name: "Advice is slow (+400 ms), 500 ms timeout", control: () => ({ timeoutMs: 500, faults: [{ stage: "advise", match: "advise:I1", kind: "slow", extraMs: 400 }] }) },
  { name: "Budget of 10 units", control: () => ({ budget: createBudget(10) }) },
  { name: "Retry bugs + budget of 12", control: () => ({ budget: createBudget(12), retry: { maxAttempts: 5, backoffMs: 0, retryPermanent: true }, faults: [{ stage: "read", match: "read:3", kind: "crash" }] }) },
  { name: "Correlate crashes", control: () => ({ faults: [{ stage: "correlate", match: "*", kind: "crash" }] }) },
];

async function go(control: ControlConfig): Promise<PlanRun> {
  const clock = createVirtualClock();
  return clock.run(runTriagePlan(raw, config, { concurrency: 1, clock, control }));
}

const verdict = (r: PlanRun) => (!r.ok ? "FAILED" : r.degraded.length ? "degraded" : "ok");
const note = (r: PlanRun) => (!r.ok ? r.message : r.degraded[0] ?? "");

console.log("Simulated time. Reads wait 100 ms, advice waits 300 ms, one task at a time.\n");
console.log("   scenario".padEnd(48), "result".padEnd(9), "time".padStart(8), "units".padStart(6), "tries".padStart(6), "  what happened");
let row = 0;
for (const s of scenarios) {
  const r = await go(s.control());
  console.log(`${String(++row).padStart(2)}. ${s.name}`.padEnd(48), verdict(r).padEnd(9), `${r.wallMs} ms`.padStart(8), String(r.unitsSpent).padStart(6), String(r.attempts).padStart(6), " ", note(r));
}

console.log("\nWhat each control costs:");
console.log("  retry    rescues a blip (row 3) but only wastes money on a bug (row 5)");
console.log("  timeout  frees you from a hang (row 7 against 6) but also cuts off a slow, healthy call (row 9)");
console.log("  budget   stops runaway spending (row 10) but can starve a stage that mattered more (row 11)");
console.log("  fallback keeps the run going with a generic answer, which is why 'degraded' is not 'ok'");

const base = await go({});
console.log("\nThe approval gate, on the normal run:");
for (const n of base.approval.notifications) console.log(`  ${n.id}  ${n.severity.padEnd(8)} ${n.status.padEnd(17)} to ${n.to}`);
console.log("  Nothing risky has been sent. A person decides, and every step is in the audit log:");
for (const a of base.approval.audit) console.log(`  ${String(a.seq).padStart(2)}. ${a.actor.padEnd(7)} ${a.action.padEnd(10)} ${a.target}  ${a.detail}`);
