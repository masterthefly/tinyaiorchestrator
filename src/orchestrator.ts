import type { Step } from "./kit/types.ts";

/**
 * The orchestrator: the loop that runs a team of agents on a shared case file.
 *
 *   repeat:
 *     ask the supervisor which agent should work next
 *     run that agent; it hands back an updated case file
 *     if the supervisor says "nobody", we are done
 *
 * An agent here is anything with a name, a job, and a function that turns a case
 * file into a better one. Some agents are plain code, some are rules, and some run
 * their own loop with tools (see the Advisor). The orchestrator does not care,
 * which is why you can swap one for another.
 *
 * It is generic: it knows nothing about logs or incidents. S is the case file.
 */

export interface AgentOutput<S> {
  state: S;
  /** One line saying what the agent did. It becomes part of the trace. */
  summary: string;
  /** If the agent ran its own tool loop, the steps it took. */
  steps?: Step[];
}

export interface Agent<S> {
  name: string;
  description: string;
  /** How the agent does its job. Shown in the trace so you can tell them apart. */
  kind: "code" | "rules" | "tools" | "model";
  /** Throw an Error to say "I cannot do this": the orchestrator reports it. */
  run(state: S): AgentOutput<S>;
}

export interface Decision {
  /** The agent that should work next, or null when the job is finished. */
  next: string | null;
  /** Why. A supervisor that cannot explain itself cannot be debugged. */
  reason: string;
}

export type Supervisor<S> = (state: S, agents: Agent<S>[]) => Decision;

/** Everything that happened, in order. The trace is how you debug a team. */
export type TraceEvent =
  | { kind: "start"; note: string }
  | { kind: "decide"; next: string | null; reason: string }
  | { kind: "run"; agent: string; how: Agent<unknown>["kind"]; summary: string; steps: Step[] }
  | { kind: "failed"; agent: string | null; reason: string }
  | { kind: "done"; reason: string };

/** Orchestration is not free: these are the costs a single function would not have. */
export interface Cost {
  supervisorCalls: number;
  agentRuns: number;
  /** Loop steps taken inside tool using agents. */
  workerSteps: number;
}

export const totalCost = (c: Cost) => c.supervisorCalls + c.agentRuns + c.workerSteps;

export interface Outcome<S> {
  ok: boolean;
  state: S;
  trace: TraceEvent[];
  cost: Cost;
  /** A one line verdict. */
  message: string;
}

/**
 * Run the team. `maxRounds` is the safety net: a supervisor that keeps picking agents
 * without finishing is stopped, just like an agent that never gives a final answer.
 */
export function orchestrate<S>(initial: S, agents: Agent<S>[], supervisor: Supervisor<S>, maxRounds = 12): Outcome<S> {
  const trace: TraceEvent[] = [{ kind: "start", note: `${agents.length} agents: ${agents.map((a) => a.name).join(", ")}` }];
  const cost: Cost = { supervisorCalls: 0, agentRuns: 0, workerSteps: 0 };
  let state = initial;

  const fail = (agent: string | null, reason: string): Outcome<S> => {
    trace.push({ kind: "failed", agent, reason });
    return { ok: false, state, trace, cost, message: reason };
  };

  for (let round = 1; round <= maxRounds; round++) {
    const decision = supervisor(state, agents);
    cost.supervisorCalls++;
    trace.push({ kind: "decide", next: decision.next, reason: decision.reason });

    if (decision.next === null) {
      trace.push({ kind: "done", reason: decision.reason });
      return { ok: true, state, trace, cost, message: decision.reason };
    }

    const agent = agents.find((a) => a.name === decision.next);
    // A supervisor naming an agent that does not exist is a bug worth seeing, not hiding.
    if (!agent) return fail(null, `The supervisor chose "${decision.next}", but there is no such agent.`);

    let output: AgentOutput<S>;
    try {
      output = agent.run(state);
    } catch (e) {
      // One agent failing must not crash the team: say which one and why.
      return fail(agent.name, `${agent.name} failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    cost.agentRuns++;
    cost.workerSteps += output.steps?.length ?? 0;
    trace.push({ kind: "run", agent: agent.name, how: agent.kind, summary: output.summary, steps: output.steps ?? [] });

    // If an agent changes nothing, asking again will change nothing. Stop instead of looping.
    if (JSON.stringify(output.state) === JSON.stringify(state)) {
      return fail(agent.name, `${agent.name} made no progress, so the team stopped instead of asking it again.`);
    }
    state = output.state;
  }
  return fail(null, `The team did not finish within ${maxRounds} rounds.`);
}
