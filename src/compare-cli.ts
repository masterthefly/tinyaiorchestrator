import { readFileSync } from "node:fs";
import { codeLines, compareAnswers, compareFailure, compareSpeed, type Broken } from "./compare/compare.ts";
import { generateSampleLog } from "./sample-log.ts";

// npm run compare
// One function against the whole team, on the built in example: same answer? what happens when a part breaks? what does it cost?

const raw = generateSampleLog();
const line = (s = "") => console.log(s);
const pad = (s: string, n: number) => s.padEnd(n);

line("Does the team earn its cost?  One plain function against the orchestrated team, on the same example.");
line();

line("1. Do they find the same thing?");
const answer = compareAnswers(raw);
line(answer.same ? `   Yes. Both find the same ${answer.incidents} incidents: same origin, spread, severity, owner and runbook steps.` : `   No: ${answer.firstDifference}`);
line("   The single function reuses the team's own parser, classifier and correlator, so this is expected.");
line("   Orchestration does not make the answer better. Whatever it earns, it earns somewhere else.");
line();

for (const [n, broken] of [[2, "advisor"], [3, "classifier"]] as [number, Broken][]) {
  line(`${n}. What happens when the ${broken} crashes?`);
  const rows = await compareFailure(raw, broken);
  for (const r of rows) {
    const got = r.returned ? `${r.incidents} incidents, ${r.advised} with advice` : "nothing";
    line(`   ${pad(r.who, 30)} ${pad(got, 30)} ${r.saidSo ? "says so" : "SILENT"}${r.note ? `   (${r.note.slice(0, 90)})` : ""}`);
  }
  line();
}

line("4. What does it cost to run?");
const s = compareSpeed(raw);
line(`   single function  ${s.singleMs.toFixed(3)} ms`);
line(`   team             ${s.teamMs.toFixed(3)} ms   (${s.ratio.toFixed(1)}x, and ${s.teamSteps} steps of bookkeeping: supervisor calls, agent runs and loop steps)`);
line("   Median of 200 runs, warmed up and interleaved. Here the work is instant, so this is pure overhead.");
line("   In a real system each step waits on a model or a service, and then the overhead disappears into the wait.");
line();

line("5. How much code is there to read?");
const size = (path: string) => codeLines(readFileSync(new URL(path, import.meta.url), "utf8"));
const single = size("./compare/monolith.ts");
const team = ["./orchestrator.ts", "./incident/supervisor.ts", "./incident/team.ts"].map(size).reduce((a, b) => a + b, 0);
const controls = ["./plan/executor.ts", "./plan/control.ts", "./plan/approval.ts", "./plan/triage-plan.ts", "./plan/clock.ts"].map(size).reduce((a, b) => a + b, 0);
line(`   single function (plain and guarded versions)   ${single} lines`);
line(`   the orchestration layer alone                  ${team} lines`);
line(`   retries, timeouts, budget, approval, planner   ${controls} lines`);
line("   The agents themselves (parser, classifier, correlator, advisor) are shared, so they cancel out.");
