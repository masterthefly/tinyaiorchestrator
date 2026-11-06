import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { builtInConnectors, checkSize, connect, ConnectorError, createUrlConnector, MAX_CHARS, textConnector, type Connector } from "../src/connectors.ts";
import { triage } from "../src/incident/team.ts";
import { fileConnector } from "../src/node-connectors.ts";

const fakeFetch = (body: string, status = 200): typeof fetch => (async () => new Response(body, { status })) as unknown as typeof fetch;

test("the text connector passes text through, and the sample connector needs no arguments", async () => {
  assert.equal(await connect(builtInConnectors, "text", { text: "hello" }), "hello");
  assert.match(await connect(builtInConnectors, "sample"), /db-primary/);
});

test("an unknown connector lists the ones that exist", async () => {
  await assert.rejects(connect(builtInConnectors, "carrier-pigeon"), /Available: sample, text, url/);
});

test("text that is too large is refused with a useful message", () => {
  assert.throws(() => checkSize("x".repeat(MAX_CHARS + 1), "The text"), /more than the 1,000,000 limit/);
  assert.equal(checkSize("fine", "The text"), "fine");
});

test("the url connector fetches text and refuses anything that is not http or https", async () => {
  const url = createUrlConnector(fakeFetch("2026-11-06T09:00:00Z svc ERROR boom"));
  assert.match(await url.read({ url: "https://example.com/app.log" }), /boom/);
  await assert.rejects(url.read({ url: "ftp://example.com/x" }), /Only http and https/);
  await assert.rejects(url.read({ url: "file:///etc/passwd" }), /Only http and https/);
  await assert.rejects(url.read({ url: "not a url" }), /not a web address/);
});

test("the url connector reports a server error and a failed request in plain words", async () => {
  await assert.rejects(createUrlConnector(fakeFetch("no", 404)).read({ url: "https://example.com/x" }), /answered 404/);
  const refusing = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  await assert.rejects(createUrlConnector(refusing).read({ url: "https://example.com/x" }), /Could not fetch example.com/);
});

test("the url connector gives up when the server never answers", async () => {
  const hanging = ((_url: unknown, init: RequestInit) =>
    new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
  await assert.rejects(createUrlConnector(hanging, 30).read({ url: "https://example.com/x" }), /did not answer within/);
});

test("the file connector reads a file and explains a missing one", async () => {
  const dir = await mkdtemp(join(tmpdir(), "orchestrator-"));
  const path = join(dir, "app.log");
  await writeFile(path, "2026-11-06T09:00:00Z svc ERROR boom\n");
  try {
    assert.match(await fileConnector.read({ path }), /boom/);
    await assert.rejects(fileConnector.read({ path: join(dir, "missing.log") }), ConnectorError);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a developer can add their own connector and use it unchanged", async () => {
  const fromMemory: Connector = {
    name: "from-memory",
    description: "Returns a fixed log.",
    args: [],
    read: async () => "2026-11-06T09:00:00Z svc ERROR Timeout connecting to db after 30s\n",
  };
  const raw = await connect([...builtInConnectors, fromMemory], "from-memory");
  const r = triage(raw);
  assert.equal(r.ok, true);
  assert.equal(r.state.incidents?.[0].origin.type, "timeout");
});

test("the connectors all describe themselves, so a page can list them", () => {
  for (const c of [...builtInConnectors, fileConnector]) {
    assert.ok(c.name && c.description, c.name);
    assert.ok(Array.isArray(c.args));
  }
  assert.equal(textConnector.args[0].name, "text");
});
