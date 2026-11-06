import { classify as rules, createClassifierAgent, hybrid, type Classify } from "../incident/classifier.ts";
import type { Agent } from "../orchestrator.ts";
import type { CaseFile, ErrorType } from "../incident/types.ts";
import { logPrompt, parseType } from "./log-prompt.ts";
import type { TextModel } from "./text-model.ts";

/**
 * The model as a classifier: message in, label out.
 *
 *   message -> logPrompt -> the model writes a word -> parseType -> a label
 *
 * If the model writes something that is not one of the known labels we do not guess: the label
 * becomes "unknown". The wrapper also remembers answers, because the same message (after numbers
 * and ids are blanked out) is asked about many times in a real log.
 *
 * `minConfidence` lets the model abstain: when it is less sure than this, the answer is "unknown"
 * and a person or the rules take over. It needs a model that can report confidence.
 */
export interface ModelClassifierOptions {
  /** How a message becomes the model's prompt. Default: logPrompt. Only needed to run an older model on the format it was trained on. */
  prompt?: (message: string) => string;
  /** 0 to 1. Below this the classifier says "unknown" instead of guessing. Default: never abstain. */
  minConfidence?: number;
}

export interface Detail {
  /** The label the model wrote, or null if it was not a known label. */
  type: ErrorType | null;
  raw: string;
  /** How sure the model was of its first word, if it can say. */
  confidence?: number;
}

export interface ModelClassifier {
  classify: Classify;
  /** What the model wrote, before any fallback or abstaining. */
  detail(message: string): Detail;
  stats(): { calls: number; cached: number; unreadable: number; abstained: number };
}

export function createModelClassifier(model: TextModel, options: ModelClassifierOptions = {}): ModelClassifier {
  const cache = new Map<string, Detail>();
  let calls = 0;
  let cached = 0;
  let unreadable = 0;
  let abstained = 0;

  const detail = (message: string): Detail => {
    const prompt = (options.prompt ?? logPrompt)(message);
    const hit = cache.get(prompt);
    if (hit) {
      cached++;
      return hit;
    }
    calls++;
    const raw = model.answer(prompt, 8, 0.05, 1).trim();
    const result: Detail = { type: parseType(raw), raw, confidence: model.confidence?.(prompt, raw) };
    if (result.type === null) unreadable++;
    cache.set(prompt, result);
    return result;
  };

  return {
    classify: (message) => {
      const d = detail(message);
      if (shouldAbstain(d, options.minConfidence)) abstained++;
      return labelFrom(d, options.minConfidence);
    },
    detail,
    stats: () => ({ calls, cached, unreadable, abstained }),
  };
}

/** True when the model was less sure than the bar. A model that cannot report confidence never abstains. */
const shouldAbstain = (d: Detail, minConfidence?: number) => minConfidence !== undefined && d.confidence !== undefined && d.confidence < minConfidence;

/** The label to use for what the model wrote: unknown if it abstained or wrote something unreadable. */
const labelFrom = (d: Detail, minConfidence?: number): ErrorType => (shouldAbstain(d, minConfidence) ? "unknown" : d.type ?? "unknown");

/**
 * A classifier that says "unknown" whenever the model is less sure than `minConfidence`, built on a
 * model classifier that already exists, so it reuses that one's memory instead of asking the model again.
 */
export function abstainBelow(m: ModelClassifier, minConfidence: number): Classify {
  return (message) => labelFrom(m.detail(message), minConfidence);
}

export type ClassifierKind = "rules" | "model" | "hybrid";

/** The Classifier agent for the chosen kind. `model` is needed for "model" and "hybrid". */
export function createClassifier(kind: ClassifierKind, model?: TextModel, options: ModelClassifierOptions = {}): Agent<CaseFile> {
  if (kind === "rules") return createClassifierAgent(rules);
  if (!model) throw new Error(`The ${kind} classifier needs a model, and none was given.`);
  const m = createModelClassifier(model, options);
  const note = options.minConfidence !== undefined ? ` It says "unknown" when it is less than ${Math.round(options.minConfidence * 100)}% sure.` : "";
  return kind === "model"
    ? createClassifierAgent(m.classify, { kind: "model", description: `Asks a small language model, trained on log lines, what kind of problem each warning and error shows.${note}` })
    : createClassifierAgent(hybrid(m.classify), { kind: "model", description: `Uses the rules when they have an answer, and asks the small model only when they do not.${note}` });
}
