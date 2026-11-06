import { test } from "node:test";
import assert from "node:assert/strict";
import { advisorTools, createAdvisor } from "../src/incident/advisor.ts";
import { classifierAgent, classify } from "../src/incident/classifier.ts";
import { correlate, normalizeMessage } from "../src/incident/correlator.ts";
import { parseLine, parserAgent } from "../src/incident/parser.ts";
import { sampleKnowledge } from "../src/incident/runbooks.ts";
import { triage } from "../src/incident/team.ts";
import { newCase, type LogEvent } from "../src/incident/types.ts";
import { generateSampleLog } from "../src/sample-log.ts";

test("the parser reads three formats into the same event", () => {
  const want = Date.UTC(2026, 10, 6, 9, 4, 40);
  const iso = parseLine("2026-11-06T09:04:40Z payments-api ERROR Timeout connecting to db");
  const bracket = parseLine("2026-11-06 09:04:40,000 [payments-api] ERROR Timeout connecting to db");
  const json = parseLine('{"ts":"2026-11-06T09:04:40Z","service":"payments-api","level":"error","msg":"Timeout connecting to db"}');
  for (const e of [iso, bracket, json]) {
    assert.deepEqual(e, { time: want, service: "payments-api", level: "error", message: "Timeout connecting to db" });
  }
});

test("level names are normalised and a time with no zone is read as UTC", () => {
  assert.equal(parseLine("2026-11-06T09:00:00 svc WARNING careful")?.level, "warn");
  assert.equal(parseLine("2026-11-06T09:00:00 svc CRITICAL down")?.level, "fatal");
  assert.equal(parseLine("2026-11-06T09:00:00 svc ERR bad")?.time, Date.UTC(2026, 10, 6, 9, 0, 0));
});

test("lines that are not log events are rejected, never guessed at", () => {
  for (const bad of ["", "   ", "---- log rotated ----", "just some words", '{"msg":"no time or level"}', "{broken json"]) {
    assert.equal(parseLine(bad), null, JSON.stringify(bad));
  }
});

test("the parser counts unreadable lines and fails when nothing is readable", () => {
  const ok = parserAgent.run(newCase("2026-11-06T09:00:00Z a INFO hi\nnot a log line"));
  assert.equal(ok.state.events?.length, 1);
  assert.equal(ok.state.unparsedLines, 1);
  assert.throws(() => parserAgent.run(newCase("nothing\nreadable here")), /no line could be read/);
});

test("the classifier names the kind of problem, first match wins", () => {
  const table: [string, string][] = [
    ["Timeout connecting to db-primary after 30s", "timeout"],
    ["connection pool exhausted: 100/100", "connection"],
    ["No space left on device", "disk"],
    ["java.lang.OutOfMemoryError: Java heap space", "memory"],
    ["Invalid token for user 4412", "auth"],
    ["429 Too Many Requests", "rate_limit"],
    ["upstream payments-api returned 502 Bad Gateway", "dependency"],
    ["NullPointerException at Foo.bar", "exception"],
    ["something nobody planned for", "unknown"],
  ];
  for (const [message, want] of table) assert.equal(classify(message), want, message);
});

test("the classifier leaves info and debug lines unlabelled", () => {
  const events: LogEvent[] = [
    { time: 1, service: "a", level: "info", message: "request timeout setting loaded" },
    { time: 2, service: "a", level: "error", message: "Timeout" },
  ];
  const out = classifierAgent.run({ ...newCase(""), events });
  assert.equal(out.state.events?.[0].type, undefined);
  assert.equal(out.state.events?.[1].type, "timeout");
});

test("messages that differ only in numbers and ids are counted as one", () => {
  const a = normalizeMessage("Timeout connecting to db-primary after 30s (req=a1b2c3)");
  const b = normalizeMessage("Timeout connecting to db-primary after 45s (req=ff00ee)");
  assert.equal(a, b);
  assert.equal(normalizeMessage("a decade of facades"), "a decade of facades"); // words are not ids
});

test("errors close together form one incident, far apart form two", () => {
  const e = (t: number, service: string): LogEvent => ({ time: t * 1000, service, level: "error", message: "x", type: "timeout" });
  const incidents = correlate([e(0, "a"), e(30, "b"), e(60, "a"), e(400, "c")]);
  assert.equal(incidents.length, 2);
  assert.deepEqual(incidents[0].services, ["a", "b"]);
  assert.equal(incidents[0].errorCount, 3);
  assert.equal(incidents[1].origin.service, "c");
});

test("warnings alone never make an incident, and unrelated warnings are not attached", () => {
  const w = (t: number, service: string): LogEvent => ({ time: t * 1000, service, level: "warn", message: "w", type: "auth" });
  const err: LogEvent = { time: 100_000, service: "db", level: "error", message: "boom", type: "disk" };
  assert.equal(correlate([w(10, "db"), w(20, "api")]).length, 0);
  const [incident] = correlate([w(70, "db"), w(80, "api"), err]);
  assert.equal(incident.warnCount, 1); // only the warning from "db", the service that failed
});

test("severity grows with how many errors and how many services are involved", () => {
  const many = (n: number, services: number): LogEvent[] =>
    Array.from({ length: n }, (_, i) => ({ time: i * 1000, service: `s${i % services}`, level: "error", message: "x", type: "timeout" }));
  assert.equal(correlate(many(2, 1))[0].severity, "minor");
  assert.equal(correlate(many(6, 1))[0].severity, "major");
  assert.equal(correlate(many(12, 3))[0].severity, "critical");
});

test("the advisor runs its own tool loop and writes the advice into the case file", () => {
  const incident = correlate([{ time: 0, service: "db-primary", level: "error", message: "pool", type: "connection" }])[0];
  const out = createAdvisor().run({ ...newCase(""), incidents: [incident] });
  const advice = out.state.incidents?.[0].advice;
  assert.equal(advice?.owner, "data platform team");
  assert.deepEqual(advice?.steps, sampleKnowledge.runbooks.connection);
  assert.deepEqual(out.steps?.map((s) => (s.action.type === "tool_call" ? s.action.tool : "answer")), ["runbook", "owner", "answer"]);
});

test("an unknown service gets the default owner, and a tool refuses a made up error type", () => {
  const tools = advisorTools(sampleKnowledge);
  assert.equal(tools[1].run({ key: "mystery-service" }), sampleKnowledge.defaultOwner);
  assert.throws(() => tools[0].run({ key: "gremlins" }), /no runbook/);
});

test("the sample log is the same every time and contains junk lines the parser must count", () => {
  assert.equal(generateSampleLog(), generateSampleLog());
  assert.ok(generateSampleLog().includes("---- log rotated ----"));
});

test("the team triages the sample: a cascade starting at the database, plus unrelated noise", () => {
  const r = triage(generateSampleLog());
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.trace.filter((e) => e.kind === "run").map((e) => (e.kind === "run" ? e.agent : "")),
    ["parser", "classifier", "correlator", "advisor"],
  );
  assert.equal(r.state.incidents?.length, 2);
  const [big, small] = r.state.incidents ?? [];
  assert.equal(big.severity, "critical");
  assert.deepEqual(big.services, ["db-primary", "payments-api", "checkout", "api-gateway"]);
  assert.equal(big.origin.service, "db-primary");
  assert.equal(big.origin.type, "connection");
  assert.equal(big.topMessages[0].count, 8); // the eight payments timeouts group into one line
  assert.equal(small.severity, "minor");
  assert.equal(small.origin.service, "batch-worker");
  assert.equal(r.state.unparsedLines, 3);
  assert.ok(big.advice && small.advice);
});

test("a log with no errors finishes cleanly with nothing to advise on", () => {
  const r = triage("2026-11-06T09:00:00Z svc INFO all quiet\n2026-11-06T09:00:05Z svc INFO still quiet\n");
  assert.equal(r.ok, true);
  assert.equal(r.state.incidents?.length, 0);
  assert.match(r.message, /no incidents/);
  assert.equal(r.trace.some((e) => e.kind === "run" && e.agent === "advisor"), false);
});

test("a log nobody can read fails at the parser, visibly", () => {
  const r = triage("hello\nthis is not a log\n");
  assert.equal(r.ok, false);
  assert.match(r.message, /parser failed/);
});
