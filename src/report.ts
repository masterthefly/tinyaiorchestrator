import type { Outcome, TraceEvent } from "./orchestrator.ts";
import { totalCost } from "./orchestrator.ts";
import type { CaseFile, Incident } from "./incident/types.ts";

const clock = (ms: number) => new Date(ms).toISOString().slice(11, 19);

/** The trace as plain text: one line per event, so a run reads like a story. */
export function describeEvent(e: TraceEvent): string[] {
  switch (e.kind) {
    case "start":
      return [`start      ${e.note}`];
    case "decide":
      return [`decide     ${e.next ?? "nobody (finished)"}: ${e.reason}`];
    case "run": {
      const lines = [`run        ${e.agent} [${e.how}] ${e.summary}`];
      for (const s of e.steps) {
        if (s.action.type === "tool_call") lines.push(`             ${s.action.tool}(${Object.values(s.action.args).join(", ")}) -> ${s.observation}`);
        else lines.push(`             answer: ${s.action.text}`);
      }
      return lines;
    }
    case "failed":
      return [`FAILED     ${e.agent ? `${e.agent}: ` : ""}${e.reason}`];
    case "done":
      return [`done       ${e.reason}`];
  }
}

export function describeTrace(outcome: Outcome<CaseFile>): string[] {
  const c = outcome.cost;
  return [
    ...outcome.trace.flatMap(describeEvent),
    `cost       ${totalCost(c)} units (${c.supervisorCalls} supervisor decisions + ${c.agentRuns} agent runs + ${c.workerSteps} tool steps)`,
  ];
}

function describeIncident(i: Incident): string[] {
  const duration = Math.round((i.end - i.start) / 1000);
  const lines = [
    `${i.id}  ${i.severity.toUpperCase()}  ${clock(i.start)} to ${clock(i.end)} UTC (${duration}s)`,
    `    likely origin: ${i.origin.service} (${i.origin.type}) at ${clock(i.origin.time)}`,
    `    spread: ${i.services.join(" > ")}`,
    `    ${i.errorCount} error${i.errorCount === 1 ? "" : "s"}${i.warnCount ? `, plus ${i.warnCount} earlier warning${i.warnCount === 1 ? "" : "s"} from the same services` : ""}`,
    "    most common messages:",
    ...i.topMessages.map((m) => `      ${String(m.count).padStart(3)}x  ${m.text}`),
  ];
  if (i.advice) {
    lines.push(`    owner: ${i.advice.owner}`);
    if (i.advice.steps.length) lines.push("    what to try:", ...i.advice.steps.slice(0, 4).map((s, n) => `      ${n + 1}. ${s}`));
    else lines.push("    what to try: no runbook for this kind of error");
  }
  return lines;
}

/** The finished report for a person to read. */
export function renderReport(state: CaseFile): string[] {
  const events = state.events?.length ?? 0;
  const unread = state.unparsedLines ?? 0;
  const incidents = state.incidents ?? [];
  const head = `Read ${events} events${unread ? ` (${unread} lines could not be read)` : ""}. ${incidents.length} incident${incidents.length === 1 ? "" : "s"} found.`;
  if (incidents.length === 0) return [head];
  return [head, "", ...incidents.flatMap((i) => [...describeIncident(i), ""]).slice(0, -1), "", "The origin is the first error seen. It is a good place to start looking, not a verdict."];
}
