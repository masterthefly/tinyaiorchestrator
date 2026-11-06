import { classify as rules, type Classify } from "../incident/classifier.ts";
import { correlate } from "../incident/correlator.ts";
import { parseLine } from "../incident/parser.ts";
import { sampleKnowledge, type KnowledgeBase } from "../incident/runbooks.ts";
import type { Advice, ErrorType, Incident, LogEvent } from "../incident/types.ts";

/**
 * The same job as the team, written as one ordinary function.
 *
 * This is the fair opponent, not a strawman. It reuses the very same parser, classifier, correlator
 * and runbooks the team uses, so any difference you measure comes from the orchestration and nothing else.
 * There is no supervisor, no trace, no agent loop: just four steps, one after another.
 */
export interface MonolithOptions {
  classify?: Classify;
  kb?: KnowledgeBase;
  /** Look up advice for one incident. Injectable so a test can make it fail. */
  advise?: (incident: Incident, kb: KnowledgeBase) => Advice;
}

export interface MonolithResult {
  incidents: Incident[];
  unparsedLines: number;
}

const STEP_COUNT = 3;

export const lookupAdvice = (incident: Incident, kb: KnowledgeBase): Advice => {
  const steps = kb.runbooks[incident.origin.type as ErrorType] ?? [];
  const owner = kb.owners[incident.origin.service] ?? kb.defaultOwner;
  const first = steps.length ? `First steps: ${steps.slice(0, STEP_COUNT).map((s, n) => `${n + 1}) ${s}`).join(" ")}.` : "There is no runbook for this kind of error, so start by reading the top messages.";
  return { owner, steps, text: `Likely origin: ${incident.origin.service} (${incident.origin.type}). Owner: ${owner}. ${first}`, source: "advisor" };
};

/** The plain version. Any failure anywhere throws, and you get nothing back. */
export function triageMonolith(raw: string, options: MonolithOptions = {}): MonolithResult {
  const classify = options.classify ?? rules;
  const kb = options.kb ?? sampleKnowledge;
  const advise = options.advise ?? lookupAdvice;

  const events: LogEvent[] = [];
  let unparsedLines = 0;
  for (const line of raw.split(/\r?\n/).filter((l) => l.trim() !== "")) {
    const e = parseLine(line);
    if (e) events.push(e);
    else unparsedLines++;
  }
  for (const e of events) if (e.level === "warn" || e.level === "error" || e.level === "fatal") e.type = classify(e.message);

  const incidents = correlate(events).map((i) => ({ ...i, advice: advise(i, kb) }));
  return { incidents, unparsedLines };
}

/**
 * The version you write after the first outage: each step guarded, so one failure costs you that
 * step and not everything. Notice what it had to grow. This is the start of rebuilding the team's controls by hand.
 */
export function triageMonolithDefended(raw: string, options: MonolithOptions = {}): MonolithResult & { problems: string[] } {
  const problems: string[] = [];
  const classify = options.classify ?? rules;
  const kb = options.kb ?? sampleKnowledge;
  const advise = options.advise ?? lookupAdvice;

  const events: LogEvent[] = [];
  let unparsedLines = 0;
  for (const line of raw.split(/\r?\n/).filter((l) => l.trim() !== "")) {
    const e = parseLine(line);
    if (e) events.push(e);
    else unparsedLines++;
  }
  for (const e of events) {
    if (e.level !== "warn" && e.level !== "error" && e.level !== "fatal") continue;
    try {
      e.type = classify(e.message);
    } catch (err) {
      e.type = "unknown";
      if (!problems.some((p) => p.startsWith("classify"))) problems.push(`classify failed: ${(err as Error).message}`);
    }
  }
  const incidents = correlate(events).map((i) => {
    try {
      return { ...i, advice: advise(i, kb) };
    } catch (err) {
      problems.push(`advise failed for ${i.id}: ${(err as Error).message}`);
      return { ...i, advice: { owner: kb.defaultOwner, steps: [], text: "No advice could be produced.", source: "fallback" as const } };
    }
  });
  return { incidents, unparsedLines, problems };
}
