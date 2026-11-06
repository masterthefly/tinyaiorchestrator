import { correlatorAgent } from "../incident/correlator.ts";
import { classifierAgent } from "../incident/classifier.ts";
import type { Agent } from "../orchestrator.ts";
import { createAdvisor } from "../incident/advisor.ts";
import { parserAgent } from "../incident/parser.ts";
import { sampleKnowledge, type KnowledgeBase } from "../incident/runbooks.ts";
import { newCase, type Advice, type CaseFile, type Incident, type LogEvent } from "../incident/types.ts";
import { defaultApprovalPolicy, draftNotifications, type ApprovalPolicy, type ApprovalState } from "./approval.ts";
import { realClock, type Clock } from "./clock.ts";
import { createBudget, type ControlConfig } from "./control.ts";
import { runTasks, type Span, type Task } from "./executor.ts";

/**
 * Planning: turning one big job into stages of small tasks.
 *
 * The step 1 team handed one whole log from agent to agent. Real logs are big, so the planner
 * cuts the work up, in the classic "map, then reduce" shape:
 *
 *   read       one task per chunk of lines (parse + classify)   many independent tasks
 *   merge      put the events back together in time order       one quick step
 *   correlate  group errors into incidents                      ONE task: it needs every event
 *   advise     one task per incident                            many independent tasks
 *   notify     draft a message for each incident                low risk goes out, risky waits for a person
 *
 * Tasks inside a stage are independent, so they may run side by side. The stages themselves must
 * run in order, because each needs the one before. The single correlate task is a bottleneck no
 * amount of parallelism can remove.
 *
 * What a failure does depends on the stage: a lost read chunk degrades the answer, a failed advise
 * can fall back to a generic note, and a failed correlate stops everything, because nothing
 * downstream can work without it.
 */
export interface PlanConfig {
  /** Lines of log per read task. */
  chunkLines: number;
  /** Simulated waiting per read task, standing in for a call to a model or service. 0 = none. */
  readLatencyMs: number;
  /** Simulated waiting per advise task. */
  adviseLatencyMs: number;
  kb?: KnowledgeBase;
  /** Which classifier labels the events. Default: the rules. */
  classifier?: Agent<CaseFile>;
  /** Which agent advises on each incident. Default: the runbook advisor. */
  advisor?: Agent<CaseFile>;
}

export const defaultPlanConfig: PlanConfig = { chunkLines: 12, readLatencyMs: 0, adviseLatencyMs: 0 };

/** What one attempt costs, in budget units. Think of units as model calls: advising is the expensive one. */
export const COST = { read: 1, correlate: 1, advise: 3 } as const;

export function splitIntoChunks(raw: string, linesPerChunk: number): string[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== "");
  const size = Math.max(1, Math.floor(linesPerChunk));
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += size) chunks.push(lines.slice(i, i + size).join("\n"));
  return chunks;
}

export const countLines = (text: string) => text.split(/\r?\n/).filter((l) => l.trim() !== "").length;

/** The plan in plain words, before anything runs. */
export function describePlan(raw: string, config: PlanConfig): string[] {
  const chunks = splitIntoChunks(raw, config.chunkLines);
  const wait = (ms: number) => (ms > 0 ? ` (each waits ${ms} ms)` : "");
  return [
    `read: ${chunks.length} task${chunks.length === 1 ? "" : "s"}, one per chunk of up to ${config.chunkLines} lines${wait(config.readLatencyMs)}`,
    "merge: put the events back in time order",
    "correlate: 1 task, because it needs every event before it can group them",
    `advise: one task per incident, known only after correlate${wait(config.adviseLatencyMs)}`,
    "notify: draft a message per incident; low risk goes out, risky waits for a person",
  ];
}

export interface PlanRun {
  ok: boolean;
  message: string;
  state: CaseFile;
  /** One span per attempt, so retries are visible. */
  spans: Span[];
  /** Real or virtual time from start to finish. */
  wallMs: number;
  /** All the attempt time added up. In parallel this exceeds wallMs. */
  workMs: number;
  /** The fastest any schedule could be: each stage costs only its slowest attempt. */
  criticalPathMs: number;
  /** Attempts actually made (not counting ones skipped for budget). */
  attempts: number;
  /** Attempts beyond the first for a task. */
  retries: number;
  unitsSpent: number;
  /** The budget cap, or null when there was none. */
  maxUnits: number | null;
  /** Things that went wrong without stopping the run. */
  warnings: string[];
  /** Places where the answer is worse than normal: lost chunks, generic fallback advice. */
  degraded: string[];
  /** Drafted messages, the simulated outbox and the audit log. */
  approval: ApprovalState;
}

export interface ReadResult {
  events: LogEvent[];
  unparsed: number;
}

/**
 * Read one chunk: parse it, then label it. The two steps fail differently, on purpose:
 *   - a chunk with nothing readable in it is not an error, just unreadable input, so we count its lines
 *   - a classifier that crashes IS an error: it must reach the retry policy and the trace, not be
 *     mistaken for bad input (an earlier version caught everything here and hid classifier failures)
 */
export function readChunk(chunk: string, classifier: Agent<CaseFile>): ReadResult {
  let parsed: CaseFile;
  try {
    parsed = parserAgent.run(newCase(chunk)).state;
  } catch {
    return { events: [], unparsed: countLines(chunk) };
  }
  const labelled = classifier.run(parsed);
  return { events: labelled.state.events ?? [], unparsed: parsed.unparsedLines ?? 0 };
}

/** If anything was lost or replaced by a fallback, this is what the drafted messages must say. */
export function degradedCaveat(degraded: string[]): string | undefined {
  if (degraded.length === 0) return undefined;
  return `this report is based on incomplete or degraded data (${degraded.length} problem${degraded.length === 1 ? "" : "s"}), so check the origin before acting`;
}

export interface RunOptions {
  /** How many tasks may run at once. 1 means one after another. */
  concurrency: number;
  clock?: Clock;
  /** Faults to inject, and the retry, timeout, budget and fallback settings. */
  control?: ControlConfig;
  approval?: ApprovalPolicy;
}

export async function runTriagePlan(raw: string, config: PlanConfig, options: RunOptions): Promise<PlanRun> {
  const clock = options.clock ?? realClock;
  const kb = config.kb ?? sampleKnowledge;
  // There is always a budget object so spending is counted; with no cap it is simply never reached.
  const budget = options.control?.budget ?? createBudget(Number.POSITIVE_INFINITY);
  const control: ControlConfig = { ...options.control, budget };
  const useFallback = options.control?.fallback ?? true;

  const started = clock.now();
  const spans: Span[] = [];
  const warnings: string[] = [];
  const degraded: string[] = [];
  let state: CaseFile = newCase(raw);
  let approval: ApprovalState = { notifications: [], sent: [], audit: [] };

  const finish = (ok: boolean, message: string): PlanRun => {
    const real = spans.filter((s) => s.note !== "budget");
    const byStage = new Map<string, number>();
    for (const s of real) byStage.set(s.stage, Math.max(byStage.get(s.stage) ?? 0, s.end - s.start));
    return {
      ok,
      message,
      state,
      spans,
      wallMs: clock.now() - started,
      workMs: real.reduce((n, s) => n + (s.end - s.start), 0),
      criticalPathMs: [...byStage.values()].reduce((a, b) => a + b, 0),
      attempts: real.length,
      retries: real.filter((s) => s.attempt > 1).length,
      unitsSpent: budget.spent,
      maxUnits: Number.isFinite(budget.maxUnits) ? budget.maxUnits : null,
      warnings,
      degraded,
      approval,
    };
  };

  // ---- read: fan out over chunks ----
  const chunks = splitIntoChunks(raw, config.chunkLines);
  const readTasks: Task<ReadResult>[] = chunks.map((chunk, i) => ({
    id: `read:${i + 1}`,
    label: `read chunk ${i + 1}`,
    latencyMs: config.readLatencyMs,
    cost: COST.read,
    work: () => readChunk(chunk, config.classifier ?? classifierAgent),
  }));
  const read = await runTasks("read", readTasks, options.concurrency, clock, control);
  spans.push(...read.flatMap((r) => r.attempts));

  // ---- merge: fan in ----
  const events: LogEvent[] = [];
  let unparsed = 0;
  read.forEach((r, i) => {
    if (r.ok && r.value) {
      events.push(...r.value.events);
      unparsed += r.value.unparsed;
    } else {
      const lines = countLines(chunks[i]);
      unparsed += lines;
      warnings.push(`${r.span.label} failed: ${r.error}`);
      degraded.push(`${r.span.label} was lost (${lines} lines), so the report may be missing events`);
    }
  });
  events.sort((a, b) => a.time - b.time);
  if (events.length === 0) {
    state = { ...state, unparsedLines: unparsed };
    return finish(false, `no line could be read as a log event (${unparsed} lines tried). Supported: ISO time, [bracket] and JSON lines.`);
  }
  state = { ...state, events, classified: true, unparsedLines: unparsed };

  // ---- correlate: one task, the bottleneck, and fatal if it fails ----
  const correlateTask: Task<CaseFile> = { id: "correlate:1", label: "correlate all events", latencyMs: 0, cost: COST.correlate, work: () => correlatorAgent.run(state).state };
  const [correlated] = await runTasks("correlate", [correlateTask], 1, clock, control);
  spans.push(...correlated.attempts);
  if (!correlated.ok || !correlated.value) {
    return finish(false, `correlate failed: ${correlated.error}. Nothing can be advised without it, so the run stopped.`);
  }
  state = correlated.value;

  // ---- advise: fan out over incidents ----
  const advisor = config.advisor ?? createAdvisor(kb);
  const incidents = state.incidents ?? [];
  const adviseTasks: Task<Incident>[] = incidents.map((incident) => ({
    id: `advise:${incident.id}`,
    label: `advise on ${incident.id}`,
    latencyMs: config.adviseLatencyMs,
    cost: COST.advise,
    work: () => advisor.run({ ...newCase(""), incidents: [incident] }).state.incidents![0],
  }));
  const advised = await runTasks("advise", adviseTasks, options.concurrency, clock, control);
  spans.push(...advised.flatMap((r) => r.attempts));
  state = {
    ...state,
    incidents: incidents.map((incident, i) => {
      const r = advised[i];
      if (r.ok && r.value) return r.value;
      warnings.push(`${r.span.label} failed: ${r.error}`);
      if (!useFallback) {
        degraded.push(`${incident.id} has no advice`);
        return incident;
      }
      const advice: Advice = {
        owner: kb.defaultOwner,
        steps: [],
        text: `Automatic advice was unavailable (${r.error}). Escalate to ${kb.defaultOwner}.`,
        source: "fallback",
      };
      degraded.push(`${incident.id} got generic fallback advice instead of a real runbook`);
      return { ...incident, advice };
    }),
  };

  // ---- notify: draft messages; risky ones wait for a person ----
  approval = draftNotifications(state.incidents ?? [], options.approval ?? defaultApprovalPolicy, degradedCaveat(degraded), kb.defaultOwner);

  const n = incidents.length;
  return finish(true, n === 0 ? "no incidents found, so there is nothing to advise on" : `${n} incident${n === 1 ? "" : "s"} triaged`);
}
