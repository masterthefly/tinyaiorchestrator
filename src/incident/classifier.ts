import type { Agent } from "../orchestrator.ts";
import type { CaseFile, ErrorType, LogEvent } from "./types.ts";

/**
 * Agent 2: the Classifier. Names the kind of problem behind each warning or error.
 *
 * There are three ways to do it, and the team does not care which it gets:
 *   rules    a list of patterns (below). Instant, explainable, and blind to wordings nobody wrote a pattern for.
 *   model    a small language model we trained (see src/model). Handles new wordings, but can be confidently wrong.
 *   hybrid   rules first, and the model only when the rules have no answer.
 *
 * Each is a function from a message to a label. `createClassifierAgent` wraps any of them as the team's agent.
 */
const RULES: [ErrorType, RegExp][] = [
  ["memory", /out of memory|\boom\b|java heap|heap space|memory limit|cannot allocate memory/i],
  ["disk", /no space left|disk (?:is )?full|disk usage|disk quota|enospc|filesystem full/i],
  ["auth", /unauthori[sz]ed|forbidden|invalid (?:token|credentials|password)|authentication failed|access denied|\b40[13]\b/i],
  ["rate_limit", /rate limit|too many requests|throttl|quota exceeded|\b429\b/i],
  ["connection", /connection (?:refused|reset|closed|pool)|econnrefused|econnreset|cannot connect|unreachable|no route to host/i],
  ["timeout", /time[d ]?-?out|deadline exceeded/i],
  ["dependency", /upstream|bad gateway|service unavailable|\b50[234]\b|dependency/i],
  ["exception", /exception|traceback|null ?pointer|segmentation fault|segfault|panic|stack trace/i],
];

export type Classify = (message: string) => ErrorType;

/** The rules. The first pattern that matches wins, so more specific patterns come first. */
export const classify: Classify = (message) => {
  for (const [type, pattern] of RULES) if (pattern.test(message)) return type;
  return "unknown";
};

/** Rules first. The model is asked only when the rules have no answer, which keeps the cheap path cheap. */
export function hybrid(model: Classify, rules: Classify = classify): Classify {
  return (message) => {
    const fromRules = rules(message);
    return fromRules !== "unknown" ? fromRules : model(message);
  };
}

export interface ClassifierOptions {
  name?: string;
  kind?: "rules" | "model";
  description?: string;
}

/** Turn any message-to-label function into the team's Classifier agent. */
export function createClassifierAgent(fn: Classify, options: ClassifierOptions = {}): Agent<CaseFile> {
  return {
    name: options.name ?? "classifier",
    description: options.description ?? "Labels each warning and error with the kind of problem it shows.",
    kind: options.kind ?? "rules",
    run(state) {
      const events: LogEvent[] = (state.events ?? []).map((e) => (e.level === "info" || e.level === "debug" ? e : { ...e, type: fn(e.message) }));
      const counts = new Map<ErrorType, number>();
      for (const e of events) if (e.type) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => `${t} x${n}`);
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      return {
        state: { ...state, events, classified: true },
        summary: total ? `labelled ${total} warnings and errors (${top.join(", ")})` : "nothing to label: no warnings or errors",
      };
    },
  };
}

export const classifierAgent: Agent<CaseFile> = createClassifierAgent(classify);
