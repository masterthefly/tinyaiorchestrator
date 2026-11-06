// A timeline chart of when each attempt ran. One row per "lane" (a lane is one task in flight at a time).
// Time runs left to right. Every chart in a comparison uses the same scale, so a shorter bar chart means faster.
// A failed attempt is red and shows an x. A retry shows its attempt number. A task that was never tried
// because the budget ran out is a small red tick.

const NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs, parent, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  parent.append(e);
  return e;
}

const base = (span) => (span.stage === "correlate" ? "C" : span.taskId.split(":")[1]); // read:3 -> 3, advise:I1 -> I1

function label(span) {
  if (!span.ok) return "×";
  return span.attempt > 1 ? `${base(span)}·${span.attempt}` : base(span);
}

/** Draw one run. `maxMs` is the right edge of the chart, shared between charts being compared. */
export function drawGantt(svg, run, maxMs) {
  svg.replaceChildren();
  const left = 14, right = 14, top = 10, rowH = 26, gap = 6, axis = 30, W = 640;
  const lanes = Math.max(1, ...run.spans.map((s) => s.lane + 1));
  const H = top + lanes * (rowH + gap) + axis;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const x = (ms) => left + ((W - left - right) * ms) / Math.max(maxMs, 1);
  const t0 = Math.min(...run.spans.map((s) => s.start));

  for (let l = 0; l < lanes; l++) {
    svgEl("rect", { x: left, y: top + l * (rowH + gap), width: W - left - right, height: rowH, rx: 6, class: "lane" }, svg);
  }
  for (const s of run.spans) {
    const y = top + s.lane * (rowH + gap);
    const g = svgEl("g", {}, svg);
    if (s.note === "budget") {
      // never tried: the money ran out
      svgEl("title", {}, g, `${s.label}: not tried, the budget ran out`);
      svgEl("rect", { x: x(s.start - t0) - 1, y: y + 2, width: 3, height: rowH - 4, class: "bar-budget" }, g);
      continue;
    }
    const x1 = x(s.start - t0);
    const w = Math.max(2, x(s.end - t0) - x1);
    svgEl("title", {}, g, `${s.label}, attempt ${s.attempt}: ${(s.end - s.start).toFixed(0)} ms${s.ok ? "" : ` (failed: ${s.note ?? "error"})`}`);
    svgEl("rect", { x: x1, y: y + 2, width: w, height: rowH - 4, rx: 5, class: `bar bar-${s.stage}${s.ok ? "" : " bar-failed"}` }, g);
    if (w > 18) svgEl("text", { x: x1 + w / 2, y: y + rowH / 2 + 4, "text-anchor": "middle", class: "bar-text" }, g, label(s));
  }
  const ay = top + lanes * (rowH + gap) + 4;
  svgEl("line", { x1: left, x2: W - right, y1: ay, y2: ay, class: "axis-line" }, svg);
  for (const frac of [0, 0.5, 1]) {
    const ms = maxMs * frac;
    svgEl("text", { x: x(ms), y: ay + 16, "text-anchor": frac === 0 ? "start" : frac === 1 ? "end" : "middle", class: "axis-text" }, svg, `${Math.round(ms)} ms`);
  }
  const total = run.spans.reduce((n, s) => Math.max(n, s.end - t0), 0);
  const failed = run.spans.filter((s) => !s.ok && s.note !== "budget").length;
  svg.setAttribute("aria-label", `Timeline: ${run.spans.length} attempts on ${lanes} lane${lanes === 1 ? "" : "s"}, finishing after ${Math.round(total)} milliseconds${failed ? `, ${failed} failed` : ""}.`);
}
