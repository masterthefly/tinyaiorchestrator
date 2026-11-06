import type { Agent } from "../orchestrator.ts";
import type { CaseFile, ErrorType, Incident, LogEvent, Severity } from "./types.ts";

/**
 * Agent 3: the Correlator. Groups errors into incidents and works out where each began.
 *
 * Errors that arrive close together belong to one incident: here, no more than GAP_SECONDS
 * between one error and the next. Warnings from the same services in the minute before the first
 * error are attached as context but never start an incident on their own.
 *
 * The "origin" is simply the first error. That is a useful guess, and only a guess: clocks
 * disagree, logs arrive late, and a quiet root cause may log nothing at all. A person (or a
 * smarter agent) should check it. The report says "likely", never "is".
 */
export const GAP_SECONDS = 120;
export const LOOKBACK_SECONDS = 60;

/** Blank out numbers and ids so "timeout after 30s (req=ab12)" and "(req=cd34)" count as one message. */
export function normalizeMessage(message: string): string {
  return message
    .replace(/\b(req|request|trace|id)=[^\s,)]+/gi, "$1=#")
    // A run of 6 or more hex digits that includes at least one number is an id, not a word like "decade".
    .replace(/\b(?=[0-9a-f]*\d)[0-9a-f]{6,}\b/gi, "#")
    .replace(/\d+/g, "#")
    // "10.0.3.14" and "09:04:40" become "#.#.#.#" and "#:#:#". Collapse them to one "#": it groups better
    // and it saves the small model's tiny window (it spends a token on every "#" and ".").
    .replace(/#(?:[.:]#)+/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

function severityOf(errorCount: number, serviceCount: number): Severity {
  if (serviceCount >= 3 && errorCount >= 10) return "critical";
  if (errorCount >= 5 || serviceCount >= 2) return "major";
  return "minor";
}

export function correlate(events: LogEvent[], gapSeconds = GAP_SECONDS, lookbackSeconds = LOOKBACK_SECONDS): Incident[] {
  const errors = events.filter((e) => e.level === "error" || e.level === "fatal");
  const warns = events.filter((e) => e.level === "warn");

  // 1. Cut the errors into bursts wherever the quiet gap is long enough.
  const bursts: LogEvent[][] = [];
  for (const e of errors) {
    const last = bursts.at(-1);
    if (last && e.time - last.at(-1)!.time <= gapSeconds * 1000) last.push(e);
    else bursts.push([e]);
  }

  // 2. Turn each burst into an incident.
  return bursts.map((burst, i) => {
    const start = burst[0].time;
    const end = burst.at(-1)!.time;

    const services: string[] = [];
    const types: Partial<Record<ErrorType, number>> = {};
    const messages = new Map<string, number>();
    for (const e of burst) {
      if (!services.includes(e.service)) services.push(e.service);
      const t = e.type ?? "unknown";
      types[t] = (types[t] ?? 0) + 1;
      const key = normalizeMessage(e.message);
      messages.set(key, (messages.get(key) ?? 0) + 1);
    }
    // Only warnings from services that are part of this incident count as its context.
    const context = warns.filter((w) => w.time >= start - lookbackSeconds * 1000 && w.time <= end && services.includes(w.service));
    const topMessages = [...messages.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([text, count]) => ({ text, count }));

    return {
      id: `I${i + 1}`,
      start,
      end,
      errorCount: burst.length,
      warnCount: context.length,
      services,
      types,
      origin: { service: burst[0].service, type: burst[0].type ?? "unknown", time: start },
      severity: severityOf(burst.length, services.length),
      topMessages,
    };
  });
}

export const correlatorAgent: Agent<CaseFile> = {
  name: "correlator",
  description: "Groups errors that happen close together into incidents and finds where each started.",
  kind: "code",
  run(state) {
    const incidents = correlate(state.events ?? []);
    const worst = incidents.find((i) => i.severity === "critical") ?? incidents[0];
    return {
      state: { ...state, incidents },
      summary: incidents.length
        ? `found ${incidents.length} incident${incidents.length === 1 ? "" : "s"}${worst ? `; worst is ${worst.id} (${worst.severity}, starting at ${worst.origin.service})` : ""}`
        : "found no incidents",
    };
  },
};
