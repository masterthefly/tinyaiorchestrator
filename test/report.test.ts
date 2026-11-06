import { test } from "node:test";
import assert from "node:assert/strict";
import { triage } from "../src/incident/team.ts";
import { describeTrace, renderReport } from "../src/report.ts";
import { generateSampleLog } from "../src/sample-log.ts";

test("the trace reads like a story and ends with the cost", () => {
  const lines = describeTrace(triage(generateSampleLog()));
  assert.match(lines[0], /^start\s+4 agents: parser, classifier, correlator, advisor$/);
  assert.ok(lines.some((l) => /^decide\s+classifier: \d+ events are not labelled yet$/.test(l)));
  assert.ok(lines.some((l) => l.includes("runbook(connection)")));
  assert.match(lines.at(-1) ?? "", /^cost\s+15 units \(5 supervisor decisions \+ 4 agent runs \+ 6 tool steps\)$/);
});

test("the report names the origin, the spread, the owner and the caveat", () => {
  const text = renderReport(triage(generateSampleLog()).state).join("\n");
  assert.match(text, /I1  CRITICAL/);
  assert.match(text, /likely origin: db-primary \(connection\)/);
  assert.match(text, /spread: db-primary > payments-api > checkout > api-gateway/);
  assert.match(text, /owner: data platform team/);
  assert.match(text, /8x  Timeout connecting to db-primary/);
  assert.match(text, /not a verdict/);
});

test("a quiet log produces a one line report", () => {
  const lines = renderReport(triage("2026-11-06T09:00:00Z svc INFO ok\n").state);
  assert.deepEqual(lines, ["Read 1 events. 0 incidents found."]);
});
