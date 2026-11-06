import { createClassifierAgent, type Classify } from "../incident/classifier.ts";
import { sampleKnowledge } from "../incident/runbooks.ts";
import { incidentSupervisor } from "../incident/supervisor.ts";
import { newCase, type CaseFile, type Incident } from "../incident/types.ts";
import { createIncidentTeam, triage } from "../incident/team.ts";
import { orchestrate, totalCost, type Agent } from "../orchestrator.ts";
import { realClock } from "../plan/clock.ts";
import { runTriagePlan } from "../plan/triage-plan.ts";
import { triageMonolith, triageMonolithDefended } from "./monolith.ts";

/** What matters about an incident, with the wording stripped out, so two implementations can be compared. */
export interface Finding {
  id: string;
  origin: string;
  type: string;
  services: string[];
  severity: string;
  errors: number;
  owner: string | null;
  steps: string[];
}

export const findings = (incidents: Incident[]): Finding[] =>
  incidents.map((i) => ({
    id: i.id,
    origin: i.origin.service,
    type: i.origin.type,
    services: i.services,
    severity: i.severity,
    errors: i.errorCount,
    owner: i.advice?.owner ?? null,
    steps: i.advice?.steps ?? [],
  }));

export interface SameAnswer {
  same: boolean;
  incidents: number;
  /** Only filled in when the answers differ. */
  firstDifference?: string;
}

/** Does the single function find what the team finds? */
export function compareAnswers(raw: string, classify?: Classify): SameAnswer {
  const team = findings(triage(raw, sampleKnowledge, classify ? classifierWith(classify) : undefined).state.incidents ?? []);
  const solo = findings(triageMonolith(raw, { classify }).incidents);
  const same = JSON.stringify(team) === JSON.stringify(solo);
  const k = team.findIndex((t, i) => JSON.stringify(t) !== JSON.stringify(solo[i]));
  return { same, incidents: team.length, firstDifference: same ? undefined : `incident ${k + 1}: team ${JSON.stringify(team[k])} vs single ${JSON.stringify(solo[k])}` };
}

const classifierWith = (fn: Classify): Agent<CaseFile> => createClassifierAgent(fn);

// ---------------------------------------------------------------------------------------------
// Failure behaviour
// ---------------------------------------------------------------------------------------------

export type Broken = "advisor" | "classifier";

export interface FailureRow {
  /** Which implementation. */
  who: string;
  /** Did it return a result at all? */
  returned: boolean;
  /** Incidents it was still able to report. */
  incidents: number;
  /** Did the incidents it reported carry advice? */
  advised: number;
  /** Did it say something went wrong? */
  saidSo: boolean;
  /** What it said, if anything. */
  note: string;
}

const boom = (what: string) => new Error(`${what} exploded`);

const crashingAgent = (name: Broken): Agent<CaseFile> => ({ name, description: `${name} that always crashes`, kind: "code", run: () => { throw boom(name); } });

/** Break one part and see what each implementation hands back. */
export async function compareFailure(raw: string, broken: Broken): Promise<FailureRow[]> {
  const rows: FailureRow[] = [];
  const advise = broken === "advisor" ? () => { throw boom("advisor"); } : undefined;
  const classify: Classify | undefined = broken === "classifier" ? () => { throw boom("classifier"); } : undefined;

  // 1. The plain function: one failure and there is no result.
  try {
    const r = triageMonolith(raw, { advise, classify });
    rows.push({ who: "single function", returned: true, incidents: r.incidents.length, advised: r.incidents.filter((i) => i.advice).length, saidSo: false, note: "" });
  } catch (e) {
    rows.push({ who: "single function", returned: false, incidents: 0, advised: 0, saidSo: true, note: `threw: ${(e as Error).message}` });
  }

  // 2. The same function after someone added try/catch around each step.
  const d = triageMonolithDefended(raw, { advise, classify });
  rows.push({ who: "single function + try/catch", returned: true, incidents: d.incidents.length, advised: d.incidents.filter((i) => i.advice?.source === "advisor").length, saidSo: d.problems.length > 0, note: d.problems.slice(0, 2).join("; ") });

  // 3. The orchestrated team, the step 1 way: stops at the failure, and says exactly where.
  const agents = createIncidentTeam(sampleKnowledge).map((a) => (a.name === broken ? crashingAgent(broken) : a));
  const team = orchestrate(newCase(raw), agents, incidentSupervisor);
  rows.push({
    who: "team (supervisor)",
    returned: true,
    incidents: team.state.incidents?.length ?? 0,
    advised: (team.state.incidents ?? []).filter((i) => i.advice).length,
    saidSo: !team.ok,
    note: team.message,
  });

  // 4. The planned team with its controls on: it keeps what it can and labels what it could not do.
  const plan = await runTriagePlan(
    raw,
    { chunkLines: 12, readLatencyMs: 0, adviseLatencyMs: 0, classifier: broken === "classifier" ? crashingAgent("classifier") : undefined, advisor: broken === "advisor" ? crashingAgent("advisor") : undefined },
    { concurrency: 1, clock: realClock },
  );
  rows.push({
    who: "team (planner + controls)",
    returned: true,
    incidents: plan.state.incidents?.length ?? 0,
    advised: (plan.state.incidents ?? []).filter((i) => i.advice?.source === "advisor").length,
    saidSo: plan.degraded.length > 0 || !plan.ok,
    note: plan.ok ? plan.degraded[0] ?? "" : plan.message,
  });
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Speed and size
// ---------------------------------------------------------------------------------------------

export interface Speed {
  singleMs: number;
  teamMs: number;
  /** teamMs / singleMs */
  ratio: number;
  /** The orchestration's own bookkeeping: supervisor calls + agent runs + loop steps. */
  teamSteps: number;
}

/** Median time of many runs, warmed up and interleaved so neither side gets the cold start. */
export function compareSpeed(raw: string, rounds = 200): Speed {
  const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const time = (f: () => unknown) => {
    const t = performance.now();
    f();
    return performance.now() - t;
  };
  for (let i = 0; i < 20; i++) {
    triageMonolith(raw);
    triage(raw);
  }
  const solo: number[] = [];
  const team: number[] = [];
  for (let i = 0; i < rounds; i++) {
    solo.push(time(() => triageMonolith(raw)));
    team.push(time(() => triage(raw)));
  }
  const singleMs = median(solo);
  const teamMs = median(team);
  return { singleMs, teamMs, ratio: teamMs / singleMs, teamSteps: totalCost(triage(raw).cost) };
}

/** Non blank, non comment lines: a rough measure of how much code there is to read. */
export const codeLines = (source: string) => source.split(/\r?\n/).filter((l) => l.trim() !== "" && !/^\s*(\/\/|\/\*|\*)/.test(l)).length;
