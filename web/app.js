// The page only connects data and draws. The team itself is ./js/*.js, built from the TypeScript in src/.
import { builtInConnectors, connect, ConnectorError } from "./js/connectors.js";
import { classify as rules, hybrid } from "./js/incident/classifier.js";
import { createIncidentTeam, triage } from "./js/incident/team.js";
import { clearlyDifferent, scoreClassifier } from "./js/eval/classifier-eval.js";
import { abstainBelow, createClassifier, createModelClassifier } from "./js/model/model-classifier.js";
import { loadModel } from "./tiny-model.js";
import { totalCost } from "./js/orchestrator.js";
import { decide } from "./js/plan/approval.js";
import { createVirtualClock } from "./js/plan/clock.js";
import { createBudget } from "./js/plan/control.js";
import { degradedCaveat, describePlan, runTriagePlan } from "./js/plan/triage-plan.js";
import { renderReport } from "./js/report.js";
import { drawGantt } from "./gantt.js";

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ---- the tabs: where the logs come from ----------------------------------------------------
let tab = "sample";
let uploaded = { name: "", text: "" };

function selectTab(name) {
  tab = name;
  for (const b of document.querySelectorAll("[role=tab]")) {
    const on = b.dataset.tab === name;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
    $(`tab-${b.dataset.tab}`).hidden = !on;
  }
  $("connect-error").hidden = true;
}
for (const b of document.querySelectorAll("[role=tab]")) {
  b.addEventListener("click", () => selectTab(b.dataset.tab));
  b.addEventListener("keydown", (e) => {
    const tabs = [...document.querySelectorAll("[role=tab]")];
    const i = tabs.indexOf(b);
    const next = e.key === "ArrowRight" ? tabs[(i + 1) % tabs.length] : e.key === "ArrowLeft" ? tabs[(i - 1 + tabs.length) % tabs.length] : null;
    if (next) {
      e.preventDefault();
      next.focus();
      selectTab(next.dataset.tab);
    }
  });
}

const FILLS = {
  quiet: "2026-11-06T09:00:00Z checkout INFO order created\n2026-11-06T09:00:05Z checkout INFO order created\n2026-11-06T09:00:09Z api-gateway INFO request completed in 52ms\n",
  junk: "hello there\nthis is not a log\njust some words\n",
  mixed:
    "2026-11-06T10:15:02Z payments-api ERROR Timeout connecting to db-primary after 30s (req=a1b2c3)\n" +
    "2026-11-06 10:15:09,000 [checkout] ERROR upstream payments-api returned 502 Bad Gateway\n" +
    '{"ts":"2026-11-06T10:15:14Z","service":"api-gateway","level":"error","msg":"503 Service Unavailable from checkout"}\n' +
    "2026-11-06T10:15:20Z payments-api ERROR Timeout connecting to db-primary after 30s (req=d4e5f6)\n" +
    "2026-11-06T10:15:31Z checkout ERROR upstream payments-api returned 502 Bad Gateway\n",
};
for (const chip of document.querySelectorAll("[data-fill]")) {
  chip.addEventListener("click", () => {
    $("paste").value = FILLS[chip.dataset.fill];
  });
}

$("file").addEventListener("change", async () => {
  const f = $("file").files[0];
  if (!f) return;
  try {
    uploaded = { name: f.name, text: await f.text() };
    $("file-name").textContent = `${f.name}: ${uploaded.text.length.toLocaleString()} characters, read in your browser.`;
  } catch {
    uploaded = { name: "", text: "" };
    $("file-name").textContent = "That file could not be read as text.";
  }
});

/** Get the raw log text for the chosen tab, through a connector. */
async function readSource() {
  if (tab === "sample") return connect(builtInConnectors, "sample");
  if (tab === "paste") return connect(builtInConnectors, "text", { text: $("paste").value });
  if (tab === "upload") {
    if (!uploaded.name) throw new ConnectorError("Choose a log file first.");
    return connect(builtInConnectors, "text", { text: uploaded.text });
  }
  return connect(builtInConnectors, "url", { url: $("url").value.trim() });
}

// ---- the pipeline ---------------------------------------------------------------------------------
const nodes = new Map();

/** Draw the four agent cards. Called again when the classifier changes, because its card changes. */
function buildPipeline(agents) {
  $("pipeline").replaceChildren();
  nodes.clear();
  for (const a of agents) {
    const card = el("div", "agent");
    const h = el("h3");
    h.append(document.createTextNode(a.name[0].toUpperCase() + a.name.slice(1)), el("span", `how how-${a.kind}`, a.kind));
    card.append(h, el("p", "", a.description), el("p", "said"));
    card.dataset.agent = a.name;
    $("pipeline").append(card);
    nodes.set(a.name, card);
  }
}

// ---- which classifier does the team use? ------------------------------------------------------------
let model = null; // the small language model, once it has loaded
const classifiers = new Map(); // one per kind, so a classifier keeps its memory between runs

/** The Classifier agent for the chosen kind, falling back to the rules until the model has loaded. */
function currentClassifier() {
  const kind = $("classifier").value;
  if (kind === "rules" || !model) return createClassifier("rules");
  if (!classifiers.has(kind)) classifiers.set(kind, createClassifier(kind === "hybrid-careful" ? "hybrid" : kind, model, kind === "hybrid-careful" ? { minConfidence: 0.99 } : {}));
  return classifiers.get(kind);
}

buildPipeline(createIncidentTeam());

function resetPipeline() {
  for (const card of nodes.values()) {
    card.className = "agent";
    card.querySelector(".said").textContent = "";
  }
  $("timeline").replaceChildren();
  $("cost").hidden = true;
  $("report").replaceChildren();
  $("report-empty").hidden = false;
  $("copy").hidden = true;
}

const speed = () => ({ normal: 1, fast: 0.35, instant: 0 })[$("speed").value] ?? 1;
let runId = 0;

function supervisorSays(next, reason) {
  const line = $("supervisor");
  line.replaceChildren();
  line.append(el("b", "", "Supervisor: "), document.createTextNode(next ? `${next}. ${reason}.` : `finished. ${reason}.`));
}

function logLine(cls, text, sub) {
  const li = el("li", cls, text);
  if (sub) for (const s of sub) li.append(el("span", "sub", s));
  $("timeline").append(li);
  li.scrollIntoView({ block: "nearest" });
}

async function play(outcome, me) {
  const k = reducedMotion ? 0 : speed();
  const wait = (ms) => (k === 0 ? Promise.resolve() : sleep(ms * k));
  for (const e of outcome.trace) {
    if (me !== runId) return false;
    if (e.kind === "decide") {
      supervisorSays(e.next, e.reason);
      if (e.next) nodes.get(e.next)?.classList.add("next");
      logLine("", `The supervisor chose ${e.next ?? "nobody"}: ${e.reason}.`);
      await wait(750);
    } else if (e.kind === "run") {
      const card = nodes.get(e.agent);
      card.classList.remove("next");
      card.classList.add("done");
      card.querySelector(".said").textContent = e.summary;
      const sub = e.steps.map((s) => (s.action.type === "tool_call" ? `${s.action.tool}(${Object.values(s.action.args).join(", ")})` : "answer written"));
      logLine("run", `${e.agent} [${e.how}] ${e.summary}`, sub);
      await wait(900);
    } else if (e.kind === "failed") {
      if (e.agent) {
        const card = nodes.get(e.agent);
        card?.classList.remove("next");
        card?.classList.add("failed");
        if (card) card.querySelector(".said").textContent = e.reason;
      }
      logLine("fail", `Failed: ${e.reason}`);
    }
  }
  return true;
}

// ---- the report ---------------------------------------------------------------------------------------
const clock = (ms) => new Date(ms).toISOString().slice(11, 19);

function drawReport(state) {
  const box = $("report");
  box.replaceChildren();
  const incidents = state.incidents ?? [];
  $("report-empty").hidden = true;
  const unread = state.unparsedLines ?? 0;
  box.append(el("p", "hint", `Read ${state.events?.length ?? 0} events${unread ? ` (${unread} lines could not be read)` : ""}. ${incidents.length} incident${incidents.length === 1 ? "" : "s"} found.`));

  for (const i of incidents) {
    const card = el("article", "incident");
    const head = el("header");
    head.append(el("h3", "", i.id), el("span", `sev ${i.severity}`, i.severity), el("span", "when", `${clock(i.start)} to ${clock(i.end)} UTC (${Math.round((i.end - i.start) / 1000)}s)`));
    card.append(head);

    const spread = el("div", "spread");
    i.services.forEach((s, n) => {
      if (n) spread.append(el("span", "arrow", "→"));
      spread.append(el("span", `svc${n === 0 ? " first" : ""}`, s));
    });
    card.append(spread, el("p", "", `Likely origin: ${i.origin.service} (${i.origin.type}) at ${clock(i.origin.time)}. ${i.errorCount} error${i.errorCount === 1 ? "" : "s"}${i.warnCount ? `, plus ${i.warnCount} earlier warning${i.warnCount === 1 ? "" : "s"} from the same services` : ""}.`));

    card.append(el("h4", "", "Most common messages"));
    const msgs = el("ul", "msgs");
    for (const m of i.topMessages) {
      const li = el("li");
      li.append(el("b", "", `${m.count}×`), document.createTextNode(m.text));
      msgs.append(li);
    }
    card.append(msgs);

    if (i.advice) {
      card.append(el("h4", "", `Owner: ${i.advice.owner}`));
      if (i.advice.steps.length) {
        const ol = el("ol", "steps");
        for (const s of i.advice.steps.slice(0, 4)) ol.append(el("li", "", s));
        card.append(el("h4", "", "What to try"), ol);
      } else {
        card.append(el("p", "", "No runbook for this kind of error."));
      }
    }
    box.append(card);
  }
  if (incidents.length) box.append(el("p", "caveat", "The origin is the first error seen. It is a good place to start looking, not a verdict."));
  $("copy").hidden = false;
}

// ---- running ---------------------------------------------------------------------------------------------------
$("run").addEventListener("click", async () => {
  const me = ++runId;
  $("connect-error").hidden = true;
  resetPipeline();
  $("supervisor").textContent = "Connecting…";
  let raw;
  try {
    raw = await readSource();
  } catch (e) {
    $("supervisor").textContent = "The supervisor is waiting. Press Run the team.";
    const msg = e instanceof ConnectorError ? e.message : `Something went wrong: ${e instanceof Error ? e.message : String(e)}`;
    $("connect-error").textContent = msg;
    $("connect-error").hidden = false;
    return;
  }
  if (me !== runId) return;

  $("run").disabled = true;
  const outcome = triage(raw, undefined, currentClassifier()); // the real work takes milliseconds; we then play it back as a story
  window.lastOutcome = outcome;
  const finished = await play(outcome, me);
  $("run").disabled = false;
  if (!finished) return;

  if (outcome.ok) {
    drawReport(outcome.state);
    const c = outcome.cost;
    $("cost").textContent = `Cost: ${totalCost(c)} units (${c.supervisorCalls} supervisor decisions, ${c.agentRuns} agent runs, ${c.workerSteps} tool steps).`;
    $("cost").hidden = false;
  } else {
    supervisorSays(null, outcome.message);
    $("supervisor").textContent = `Supervisor: stopped. ${outcome.message}`;
  }
});

$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(renderReport(window.lastOutcome.state).join("\n"));
    $("copy").textContent = "Copied";
  } catch {
    $("copy").textContent = "Your browser blocked copying";
  }
  setTimeout(() => ($("copy").textContent = "Copy the report as text"), 1800);
});

// ---- real source for developers ------------------------------------------------------------------------------------
async function showSource(file, pattern, target) {
  try {
    const r = await fetch(file);
    if (!r.ok) throw new Error(String(r.status));
    const m = (await r.text()).match(pattern);
    target.textContent = m ? m[0].trim() : "Could not find that part of the file.";
  } catch {
    target.textContent = `Could not load ${file}. Run \`npm run build:web\` first.`;
  }
}
showSource("src/connectors.ts", /\/\*\*\n \* Connectors: how data gets into the team\.[\s\S]*?\nexport interface Connector \{[\s\S]*?\n}\n/, $("code-connector"));
showSource("src/incident/supervisor.ts", /\/\*\*\n \* The supervisor decides[\s\S]*$/, $("code-supervisor"));

// ---- can it go faster? one at a time against side by side ------------------------------------------
for (const [slider, out] of [["p-lanes", "p-lanes-out"], ["p-read", "p-read-out"], ["p-advise", "p-advise-out"]]) {
  $(slider).addEventListener("input", () => ($(out).textContent = $(slider).value));
}

$("compare").addEventListener("click", async () => {
  $("plan-error").hidden = true;
  let raw;
  try {
    raw = await readSource(); // the same data you connected in step 1
  } catch (e) {
    $("plan-error").textContent = e instanceof ConnectorError ? e.message : `Something went wrong: ${e instanceof Error ? e.message : String(e)}`;
    $("plan-error").hidden = false;
    return;
  }

  const config = { chunkLines: Number($("p-chunk").value), readLatencyMs: Number($("p-read").value), adviseLatencyMs: Number($("p-advise").value), classifier: currentClassifier() };
  const lanes = Number($("p-lanes").value);
  $("plan-lines").replaceChildren(...describePlan(raw, config).map((l) => el("li", "", l)));
  $("compare").disabled = true;
  $("gantts").hidden = false;
  $("gantt-verdict").textContent = "Running one at a time…";
  $("g1-title").textContent = "One at a time";
  $("g2-title").textContent = `${lanes} at a time`;
  $("g1").replaceChildren();
  $("g2").replaceChildren();

  const seq = await runTriagePlan(raw, config, { concurrency: 1 });
  if (!seq.ok) {
    $("gantt-verdict").textContent = `The plan could not run: ${seq.message}`;
    $("compare").disabled = false;
    return;
  }
  const scale = Math.max(seq.wallMs, 1);
  drawGantt($("g1"), seq, scale);
  $("g1-title").textContent = `One at a time: ${Math.round(seq.wallMs)} ms`;

  $("gantt-verdict").textContent = `Running ${lanes} at a time…`;
  const par = await runTriagePlan(raw, config, { concurrency: lanes });
  drawGantt($("g2"), par, scale);
  $("g2-title").textContent = `${lanes} at a time: ${Math.round(par.wallMs)} ms`;

  const same = JSON.stringify(seq.state.incidents) === JSON.stringify(par.state.incidents);
  const verdict = $("gantt-verdict");
  const waits = config.readLatencyMs > 0 || config.adviseLatencyMs > 0;
  const sameAnswer = same ? "The answer is identical either way." : "The answers DIFFER, which is a bug.";

  if (!waits || seq.wallMs < 20) {
    // Runs this short are mostly timer noise, so do not print a speedup: it would be a made up number.
    verdict.textContent =
      `Both runs finished in a few milliseconds, too fast to compare. Nothing waits here, so there is nothing to overlap: look at the chart: every task takes no time at all. ` +
      `A task that never waits is over before another could overlap with it, however many lanes you ask for. ${sameAnswer}`;
  } else {
    const speedup = seq.wallMs / Math.max(par.wallMs, 0.001);
    const ideal = seq.wallMs / Math.max(seq.criticalPathMs, 0.001);
    const why =
      speedup > ideal * 0.9
        ? "That is about as fast as any schedule could go: each stage finishes only when its slowest task does, and the correlate step cannot be split."
        : "Try more lanes, or smaller chunks: there is still waiting that could overlap.";
    verdict.textContent =
      `${speedup.toFixed(1)}x faster (the best possible here is ${ideal.toFixed(1)}x). Total work was ${Math.round(par.workMs)} ms side by side against ${Math.round(seq.workMs)} ms one at a time: ` +
      `parallel moves the work around, it does not remove it. ${why} ${sameAnswer}`;
  }
  $("compare").disabled = false;
});

// ---- when things go wrong: break an agent, defend the team, approve the risky part ----------------------
for (const [slider, out] of [["c-attempts", "c-attempts-out"], ["c-backoff", "c-backoff-out"], ["c-timeout", "c-timeout-out"], ["c-budget", "c-budget-out"]]) {
  $(slider).addEventListener("input", () => ($(out).textContent = $(slider).value));
}

/** Read the page's controls into the same ControlConfig the tests use. */
function controlFromPage() {
  const target = $("c-target").value;
  const kind = $("c-kind").value;
  const timeout = Number($("c-timeout").value);
  const budget = Number($("c-budget").value);
  return {
    retry: { maxAttempts: Number($("c-attempts").value), backoffMs: Number($("c-backoff").value), retryPermanent: $("c-bugs").checked },
    timeoutMs: timeout > 0 ? timeout : undefined,
    budget: budget > 0 ? createBudget(budget) : undefined,
    fallback: $("c-fallback").checked,
    faults: kind === "none" ? [] : [{ stage: target.split(":")[0], match: target, kind, extraMs: 400 }],
  };
}

const approvalPolicy = () => ({ requireFor: ["critical", "major", "minor"].filter((s) => $(`a-${s}`).checked) });
let approvalState = null;
let lastIncidents = [];
let lastDegraded = [];

function drawApprovals() {
  const box = $("approvals");
  box.replaceChildren();
  if (!approvalState.notifications.length) box.append(el("p", "hint", "No messages were drafted."));
  for (const n of approvalState.notifications) {
    const card = el("article", `note note-${n.status}`);
    const head = el("header");
    head.append(el("strong", "", n.subject), el("span", `badge badge-${n.status}`, n.status.replace("_", " ")));
    card.append(head, el("p", "", `To ${n.to}: ${n.body}`));
    if (n.status === "pending_approval") {
      const row = el("div", "row");
      const yes = el("button", "ghost", "Approve and send");
      const no = el("button", "ghost", "Reject");
      yes.type = no.type = "button";
      yes.addEventListener("click", () => { approvalState = decide(approvalState, n.id, "approve", "you"); drawApprovals(); });
      no.addEventListener("click", () => { approvalState = decide(approvalState, n.id, "reject", "you"); drawApprovals(); });
      row.append(yes, no);
      card.append(row);
    }
    box.append(card);
  }
  box.append(el("p", "hint", `Outbox (simulated): ${approvalState.sent.length} message${approvalState.sent.length === 1 ? "" : "s"} sent.`));
  $("audit").replaceChildren(...approvalState.audit.map((a) => el("li", "", `${a.actor} ${a.action.replace("_", " ")} ${a.target}: ${a.detail}`)));
}

async function simulate(control, lanes, config, raw) {
  const clock = createVirtualClock(); // simulated time: instant and exact
  return clock.run(runTriagePlan(raw, config, { concurrency: lanes, clock, control, approval: approvalPolicy() }));
}

$("chaos-run").addEventListener("click", async () => {
  $("plan-error").hidden = true;
  let raw;
  try {
    raw = await readSource();
  } catch (e) {
    $("chaos-out").hidden = false;
    $("chaos-verdict").textContent = e instanceof ConnectorError ? e.message : `Something went wrong: ${e instanceof Error ? e.message : String(e)}`;
    return;
  }
  $("chaos-run").disabled = true;
  const config = { chunkLines: 12, readLatencyMs: 100, adviseLatencyMs: 300, classifier: currentClassifier() };
  const lanes = Number($("c-lanes").value);

  const normal = await simulate({}, lanes, config, raw);
  const run = await simulate(controlFromPage(), lanes, config, raw);

  $("chaos-out").hidden = false;
  drawGantt($("gc"), run, Math.max(run.wallMs, 1));

  const status = !run.ok ? "FAILED" : run.degraded.length ? "Finished, but degraded" : "Finished normally";
  $("chaos-verdict").textContent =
    `${status}. ${Math.round(run.wallMs)} ms (a normal run takes ${Math.round(normal.wallMs)} ms). ` +
    `${run.unitsSpent} units spent${run.maxUnits !== null ? ` of a ${run.maxUnits} unit budget` : ""} (normal: ${normal.unitsSpent}). ` +
    `${run.attempts} attempts, ${run.retries} of them retries.`;
  $("chaos-verdict").className = `verdict ${!run.ok ? "bad" : run.degraded.length ? "warn" : "good"}`;

  const notes = [];
  if (!run.ok) notes.push(`The run stopped: ${run.message}`);
  for (const d of run.degraded) notes.push(`Degraded: ${d}.`);
  for (const w of run.warnings) notes.push(`Warning: ${w}.`);
  if (run.ok && run.degraded.length === 0) notes.push("Nothing was lost: the answer matches a normal run.");
  $("chaos-notes").replaceChildren(...notes.map((t) => el("li", "", t)));

  lastIncidents = run.state.incidents ?? [];
  lastDegraded = run.degraded;
  approvalState = run.approval;
  drawApprovals();
  $("chaos-run").disabled = false;
});

// Changing who needs to approve re-drafts the messages from the last run.
for (const s of ["critical", "major", "minor"]) {
  $(`a-${s}`).addEventListener("change", async () => {
    if (!approvalState) return;
    const { draftNotifications } = await import("./js/plan/approval.js");
    approvalState = draftNotifications(lastIncidents, approvalPolicy(), degradedCaveat(lastDegraded));
    drawApprovals();
  });
}

// ---- load the model, and let the page switch classifiers --------------------------------------------------
(async () => {
  const status = $("model-status");
  try {
    status.textContent = "Loading the small model…";
    const loaded = await loadModel((p) => (status.textContent = `Loading the small model… ${Math.round(p * 100)}%`));
    model = loaded.model;
    status.textContent = `Model ready: ${(loaded.params / 1e6).toFixed(2)}M parameters, ${loaded.megabytes.toFixed(1)} MB, running in your browser.`;
    for (const o of $("classifier").options) o.disabled = false;
    $("score-run").disabled = false;
  } catch (err) {
    console.error(err);
    status.textContent = "The small model could not be loaded, so only the rules are available.";
  }
})();

$("classifier").addEventListener("change", () => {
  buildPipeline(createIncidentTeam(undefined, currentClassifier()));
  resetPipeline();
});

// ---- rules or a model? score every classifier live ------------------------------------------------------------
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const pct = (x) => `${Math.round(100 * x)}%`;
const SETS = {
  seen: ["Trained wordings", "fresh examples of phrasings it learned"],
  new: ["New wordings", "phrasings it never trained on"],
  wild: ["Real world style", "hand written lines in the style of real systems"],
};

function setBlock(set, contenders) {
  const [title, note] = SETS[set];
  const block = el("div", "set-block");
  block.append(el("h3", "", `${title} (${contenders[0][2][set].total} lines)`), el("p", "hint", note));
  for (const [name, kind, scores] of contenders) {
    const s = scores[set];
    const row = el("div", `srow ${kind}`);
    const track = el("span", "strack");
    const fill = el("span", "sfill");
    track.append(fill);
    const num = el("span", "snum", pct(s.right / s.total));
    num.append(el("small", "", `${pct(s.low)} to ${pct(s.high)}`));
    row.append(el("span", "sname", name), track, num);
    block.append(row);
    requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = pct(s.right / s.total))));
  }
  return block;
}

$("score-run").addEventListener("click", async () => {
  try {
    await scoreEverything();
  } catch (e) {
    console.error(e);
    $("score-progress").hidden = true;
    $("score-out").hidden = false;
    $("score-sets").replaceChildren();
    $("score-verdict").textContent = `Scoring failed: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    $("score-run").disabled = false;
  }
});

async function scoreEverything() {
  $("score-run").disabled = true;
  $("score-progress").hidden = false;
  $("score-out").hidden = true;
  const tests = await fetch("data/log-eval.json").then((r) => r.json());

  // Ask the model about every line once (it remembers), showing progress. This is the slow part.
  const plain = createModelClassifier(model);
  const t0 = performance.now();
  for (let i = 0; i < tests.length; i++) {
    plain.detail(tests[i].message);
    if (i % 6 === 5) {
      $("score-progress").value = (i + 1) / tests.length;
      await nextFrame();
    }
  }
  const modelMs = (performance.now() - t0) / Math.max(1, plain.stats().calls);

  const careful = abstainBelow(plain, 0.99);
  const contenders = [
    ["Rules", "rules", rules],
    ["Model", "model", plain.classify],
    ["Hybrid: rules, then model", "hybrid", hybrid(plain.classify)],
    ["Model, unknown below 99%", "model", careful],
    ["Hybrid, unknown below 99%", "hybrid", hybrid(careful)],
  ].map(([name, kind, fn]) => [name, kind, scoreClassifier(fn, tests)]);

  $("score-sets").replaceChildren(...["seen", "new", "wild"].map((set) => setBlock(set, contenders)));

  // A plain verdict for each set, from the ranges, not from the point estimates.
  const [, , r] = contenders[0], [, , m] = contenders[1], [, , h] = contenders[2];
  const say = (set) => {
    const [title] = SETS[set];
    const lead = (a, an, b, bn) => (clearlyDifferent(a[set], b[set]) ? `${a[set].right / a[set].total > b[set].right / b[set].total ? an : bn} is clearly ahead of ${a[set].right / a[set].total > b[set].right / b[set].total ? bn : an}` : `${an} and ${bn} cannot be told apart`);
    return `${title}: ${lead(m, "the model", r, "the rules")}; ${lead(h, "the hybrid", r, "the rules")}.`;
  };
  $("score-verdict").textContent = `${["seen", "new", "wild"].map(say).join(" ")} The new wordings test is hard on keyword rules by design, and the rules get free points there from saying "unknown". The real world style lines are the fairest guide.`;

  // How each one fails
  const ruleWrong = r.wild.wrong;
  const failSafe = ruleWrong.filter((w) => w.said === "unknown").length;
  const col = (title, intro, items) => {
    const c = el("div");
    c.append(el("h4", "", title), el("p", "hint", intro));
    const ul = el("ul");
    for (const i of items) ul.append(i);
    c.append(ul);
    return c;
  };
  const li = (text, cls) => el("li", cls, text);
  const rulesItems = ruleWrong.slice(0, 5).map((w) => li(`${w.message.slice(0, 60)}: said ${w.said}, truth ${w.truth}`));
  const modelWrong = m.wild.wrong.map((w) => ({ ...w, conf: plain.detail(w.message).confidence }));
  const modelItems = modelWrong.slice(0, 5).map((w) => li(`${w.message.slice(0, 60)}: said ${w.said}, truth ${w.truth}${w.conf !== undefined ? ` (${Math.round(w.conf * 100)}% sure)` : ""}`, w.conf > 0.99 ? "said-conf" : ""));
  $("fail-cols").replaceChildren(
    col("Rules fail safe", `${failSafe} of their ${ruleWrong.length} real world mistakes were "unknown": no pattern matched, so they said so.`, rulesItems),
    col("The model fails loud", "It always picks a trained label, even for lines unlike anything it saw. Red means more than 99% sure and still wrong.", modelItems),
  );

  // Letting the model abstain: the trade
  const pool = tests.filter((t) => t.set !== "seen").map((t) => ({ truth: t.type, ...plain.detail(t.message) }));
  const table = $("cover-table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const text of ["Answers only if at least", "Lines it answers", "Right, of those"]) head.append(Object.assign(document.createElement("th"), { textContent: text }));
  const body = table.createTBody();
  for (const th of [0, 0.9, 0.99, 0.999]) {
    const answered = pool.filter((x) => (x.confidence ?? 1) >= th);
    const right = answered.filter((x) => x.type === x.truth).length;
    const row = body.insertRow();
    row.insertCell().textContent = th === 0 ? "anything (never abstains)" : `${th * 100}% sure`;
    row.insertCell().textContent = pct(answered.length / pool.length);
    row.insertCell().textContent = pct(right / Math.max(1, answered.length));
  }
  const loud = pool.filter((x) => x.type !== x.truth && (x.confidence ?? 0) > 0.99).length;

  // Time
  const t1 = performance.now();
  for (let k = 0; k < 20; k++) for (const t of tests) rules(t.message);
  const rulesMicros = ((performance.now() - t1) / (20 * tests.length)) * 1000;
  $("score-time").textContent =
    `Abstaining lowers the headline accuracy (an "unknown" counts as wrong), but it tells you which answers to trust. Still, ${loud} of the model's ${pool.filter((x) => x.type !== x.truth).length} wrong answers were given with more than 99% confidence, so confidence alone is not a safety net. ` +
    `Cost: the rules take about ${rulesMicros.toFixed(1)} microseconds a line; the model about ${modelMs.toFixed(0)} milliseconds in this browser.`;

  $("score-progress").hidden = true;
  $("score-out").hidden = false;
}
