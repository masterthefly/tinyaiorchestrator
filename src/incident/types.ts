/**
 * The case file: the shared notebook the agents read from and write to.
 * Each agent adds one thing, and the next agent builds on it:
 *
 *   raw text -> events (Parser) -> typed events (Classifier) -> incidents (Correlator) -> advice (Advisor)
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export type ErrorType =
  | "memory"
  | "disk"
  | "auth"
  | "rate_limit"
  | "connection"
  | "timeout"
  | "dependency"
  | "exception"
  | "unknown";

export interface LogEvent {
  /** Milliseconds since 1970, in UTC. */
  time: number;
  service: string;
  level: LogLevel;
  message: string;
  /** Set by the Classifier, for warnings and errors only. */
  type?: ErrorType;
}

export type Severity = "critical" | "major" | "minor";

export interface Advice {
  owner: string;
  steps: string[];
  /** The advisor's own words. */
  text: string;
  /** "fallback" means the advisor failed and this is a generic note, not real advice. */
  source?: "advisor" | "fallback";
}

export interface Incident {
  id: string;
  /** First and last error, in milliseconds. */
  start: number;
  end: number;
  errorCount: number;
  /** Warnings just before or inside the incident. */
  warnCount: number;
  /** Services in the order they first reported an error. */
  services: string[];
  types: Partial<Record<ErrorType, number>>;
  /** The first error. Usually where it started, but see the caveat in the correlator. */
  origin: { service: string; type: ErrorType; time: number };
  severity: Severity;
  /** The most common messages, with numbers and ids blanked out so repeats group together. */
  topMessages: { text: string; count: number }[];
  advice?: Advice;
}

export interface CaseFile {
  raw: string;
  /** How many lines the Parser could not read. */
  unparsedLines?: number;
  events?: LogEvent[];
  classified?: boolean;
  incidents?: Incident[];
}

export const newCase = (raw: string): CaseFile => ({ raw });
