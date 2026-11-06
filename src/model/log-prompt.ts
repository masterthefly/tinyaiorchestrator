import { normalizeMessage } from "../incident/correlator.ts";
import type { ErrorType } from "../incident/types.ts";

/**
 * How a log message becomes text for the tiny model, and how its answer becomes a label.
 *
 * The SAME function builds the training data and the live prompts. That is deliberate: a model fine
 * tuned on one text format quietly falls apart on another (the first project measured it: changing
 * one word of the prompt dropped a model from 9 of 12 to 0 of 12). One function means one format.
 *
 * The base model reads only 64 tokens at once, so the message is normalised (numbers and ids become
 * "#", which also helps it generalise) and cut to MAX_MESSAGE_CHARS. A training example longer than the
 * window is silently dropped by the trainer, so keeping messages short is not optional.
 */
export const MAX_MESSAGE_CHARS = 68;

export const ERROR_TYPES: ErrorType[] = ["memory", "disk", "auth", "rate_limit", "connection", "timeout", "dependency", "exception", "unknown"];

/** The text the model is asked to continue. Always ends with "Type:". */
export function logPrompt(message: string): string {
  const clean = normalizeMessage(message).slice(0, MAX_MESSAGE_CHARS);
  return `Log: ${clean}\nType:`;
}

/** What the model should write for a label (with the leading space it learned). */
export const logResponse = (type: ErrorType): string => ` ${type}`;

/**
 * Read the model's text back into a label. Returns null when it is not one of the known types,
 * so the caller can say "the model wrote something unreadable" instead of guessing.
 */
export function parseType(raw: string): ErrorType | null {
  const word = raw.trim().split(/\s+/)[0] ?? "";
  return (ERROR_TYPES as string[]).includes(word) ? (word as ErrorType) : null;
}
