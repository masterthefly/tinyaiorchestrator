import { builtInConnectors, connect, ConnectorError } from "./connectors.ts";
import { fileConnector } from "./node-connectors.ts";
import { describePlan, runTriagePlan, defaultPlanConfig, type PlanConfig } from "./plan/triage-plan.ts";

const [source = "sample", value] = process.argv.slice(2);
const concurrency = 4;

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/**
 * Timing needs care. The first runs of any code are slower (the engine is still warming up), and a
 * single run of something under a millisecond is mostly noise. So: warm both modes up, then ALTERNATE
 * between them (so neither gets the benefit of running second) and report the median of each.
 */
async function measure(raw: string, config: PlanConfig, title: string, reps: number, digits: number) {
  console.log(`\n${title}`);
  for (const line of describePlan(raw, config)) console.log(`  ${line}`);

  for (let i = 0; i < 30; i++) {
    await runTriagePlan(raw, config, { concurrency: 1 });
    await runTriagePlan(raw, config, { concurrency });
  }
  const seqWalls: number[] = [];
  const parWalls: number[] = [];
  let seq = await runTriagePlan(raw, config, { concurrency: 1 });
  let par = await runTriagePlan(raw, config, { concurrency });
  for (let i = 0; i < reps; i++) {
    seq = await runTriagePlan(raw, config, { concurrency: 1 });
    seqWalls.push(seq.wallMs);
    par = await runTriagePlan(raw, config, { concurrency });
    parWalls.push(par.wallMs);
  }

  const seqMs = median(seqWalls);
  const parMs = median(parWalls);
  const row = (name: string, ms: number) => `  ${name.padEnd(14)} ${ms.toFixed(digits).padStart(8)} ms  (median of ${reps} runs)`;
  console.log(row("one at a time", seqMs));
  console.log(row(`${concurrency} at a time`, parMs));
  console.log(`  speedup ${(seqMs / Math.max(parMs, 1e-6)).toFixed(2)}x`);
  console.log(`  same answer either way: ${JSON.stringify(seq.state.incidents) === JSON.stringify(par.state.incidents) ? "yes" : "NO, this is a bug"}`);
  return { seqMs, criticalPathMs: seq.criticalPathMs };
}

try {
  const raw = await connect([...builtInConnectors, fileConnector], source, source === "file" ? { path: value ?? "" } : source === "url" ? { url: value ?? "" } : {});
  console.log("Does running the same work side by side make it faster? Measured with the real clock.");

  await measure(raw, { ...defaultPlanConfig }, "1. Pure computation, nothing waits", 300, 3);
  console.log("  Nothing waits, so there is nothing to overlap. Expect about 1x: a difference of a few");
  console.log("  microseconds is overhead and noise, not parallelism.");

  const waiting = await measure(raw, { ...defaultPlanConfig, readLatencyMs: 120, adviseLatencyMs: 300 }, "2. With simulated waiting, as if each task called a model or a remote service", 3, 0);
  const best = waiting.seqMs / Math.max(waiting.criticalPathMs, 1e-6);
  console.log(`  The best any schedule could do is ${best.toFixed(1)}x, set by the slowest task in each stage (correlate cannot be split).`);
  console.log("\nThe waiting is simulated: it stands in for a network call or a model.");
} catch (e) {
  if (e instanceof ConnectorError) {
    console.error(e.message);
    process.exitCode = 2;
  } else throw e;
}
