import { test } from "node:test";
import assert from "node:assert/strict";
import { orchestrate, totalCost, type Agent, type Supervisor } from "../src/orchestrator.ts";

// A tiny made up case file, so these tests are about orchestration and nothing else.
interface Counter {
  n: number;
}
const add = (name: string, by: number): Agent<Counter> => ({
  name,
  description: `adds ${by}`,
  kind: "code",
  run: (s) => ({ state: { n: s.n + by }, summary: `added ${by}` }),
});
const upTo = (limit: number, who: string): Supervisor<Counter> => (s) =>
  s.n >= limit ? { next: null, reason: "reached the limit" } : { next: who, reason: `${s.n} is below ${limit}` };

test("the supervisor picks agents until it says nobody", () => {
  const r = orchestrate({ n: 0 }, [add("a", 2)], upTo(6, "a"));
  assert.equal(r.ok, true);
  assert.equal(r.state.n, 6);
  assert.deepEqual(r.trace.map((e) => e.kind), ["start", "decide", "run", "decide", "run", "decide", "run", "decide", "done"]);
});

test("every decision carries its reason into the trace", () => {
  const r = orchestrate({ n: 0 }, [add("a", 5)], upTo(5, "a"));
  const decisions = r.trace.filter((e) => e.kind === "decide");
  assert.deepEqual(decisions.map((d) => (d.kind === "decide" ? d.reason : "")), ["0 is below 5", "reached the limit"]);
});

test("cost counts decisions, runs and tool steps separately", () => {
  const r = orchestrate({ n: 0 }, [add("a", 3)], upTo(6, "a"));
  assert.deepEqual(r.cost, { supervisorCalls: 3, agentRuns: 2, workerSteps: 0 });
  assert.equal(totalCost(r.cost), 5);
});

test("a supervisor naming an agent that does not exist is reported, not hidden", () => {
  const r = orchestrate({ n: 0 }, [add("a", 1)], () => ({ next: "ghost", reason: "test" }));
  assert.equal(r.ok, false);
  assert.match(r.message, /no such agent/);
});

test("an agent that throws fails the run visibly and names the agent", () => {
  const broken: Agent<Counter> = {
    name: "broken",
    description: "",
    kind: "code",
    run: () => {
      throw new Error("it exploded");
    },
  };
  const r = orchestrate({ n: 0 }, [broken], () => ({ next: "broken", reason: "test" }));
  assert.equal(r.ok, false);
  assert.match(r.message, /broken failed: it exploded/);
  assert.equal(r.trace.at(-1)?.kind, "failed");
});

test("an agent that changes nothing is stopped instead of asked again", () => {
  const idle: Agent<Counter> = { name: "idle", description: "", kind: "code", run: (s) => ({ state: s, summary: "did nothing" }) };
  const r = orchestrate({ n: 0 }, [idle], () => ({ next: "idle", reason: "always" }));
  assert.equal(r.ok, false);
  assert.match(r.message, /made no progress/);
  assert.equal(r.cost.agentRuns, 1);
});

test("a supervisor that never finishes is stopped by the round limit", () => {
  const r = orchestrate({ n: 0 }, [add("a", 1)], () => ({ next: "a", reason: "again" }), 4);
  assert.equal(r.ok, false);
  assert.match(r.message, /did not finish within 4 rounds/);
  assert.equal(r.cost.agentRuns, 4);
});
