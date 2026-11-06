/**
 * Control: what a team does when things go wrong.
 *
 * Four ideas, each with a price:
 *
 *   retry     try again after a failure. Helps with blips, wastes money on bugs.
 *   timeout   stop waiting after a while. Frees you from a hung call, cuts off slow but healthy ones.
 *   budget    a cap on total spend. Stops a retry storm, at the cost of leaving work undone.
 *   fallback  a cheaper, worse answer when the good one fails. Keeps going, but quietly lower quality.
 *
 * Everything here is simulated time and simulated failures, so a run is repeatable and a test can
 * check exact numbers.
 */

/** A failure that says whether trying again could help. */
export class TaskError extends Error {
  /** Transient means "might work next time" (a blip). Permanent means "it will fail again" (a bug). */
  transient: boolean;
  constructor(message: string, transient: boolean) {
    super(message);
    this.transient = transient;
  }
}

export interface RetryPolicy {
  /** Total attempts including the first. 1 means never retry. */
  maxAttempts: number;
  /** Wait before the second attempt; it doubles each time after that. */
  backoffMs: number;
  /** Retry even failures marked permanent. Almost always a mistake: it only burns budget. */
  retryPermanent?: boolean;
}

/** A shared spending limit. Units stand for model calls, tokens or money. */
export interface Budget {
  maxUnits: number;
  spent: number;
}

export const createBudget = (maxUnits: number): Budget => ({ maxUnits, spent: 0 });

/**
 * Ways to break a task on purpose.
 *   crash  every attempt fails, and retrying cannot help (a permanent failure)
 *   flaky  the first few attempts fail, then it works (a transient failure)
 *   hang   the call never answers, until something gives up (here, after 60 seconds)
 *   slow   each attempt takes extra time
 */
export type FaultKind = "crash" | "flaky" | "hang" | "slow";

export interface Fault {
  stage: string;
  /** A task id such as "read:3" or "advise:I1", or "*" for every task in the stage. */
  match: string;
  kind: FaultKind;
  /** flaky: how many attempts fail before one succeeds. Default 1. */
  failFirst?: number;
  /** slow: extra waiting per attempt. */
  extraMs?: number;
}

export interface ControlConfig {
  retry?: RetryPolicy;
  /** Give up on one attempt after this long. */
  timeoutMs?: number;
  budget?: Budget;
  faults?: Fault[];
  /** When advice cannot be produced, write a generic note instead of leaving the incident bare. Default true. */
  fallback?: boolean;
}

/** How long a hung call waits before something outside gives up on it, if there is no timeout. */
export const HANG_MS = 60_000;

export function faultsFor(control: ControlConfig | undefined, stage: string, taskId: string): Fault[] {
  return (control?.faults ?? []).filter((f) => f.stage === stage && (f.match === "*" || f.match === taskId));
}
