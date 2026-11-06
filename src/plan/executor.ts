import type { Clock } from "./clock.ts";
import { faultsFor, HANG_MS, TaskError, type ControlConfig } from "./control.ts";

/**
 * Running a batch of tasks, one at a time or several at once, with controls.
 *
 * A task is a unit of work with an id and a label. `latencyMs` is time the task spends WAITING, such
 * as a call to a model or a remote service. In this project that wait is simulated and the page says so:
 * it stands in for the real thing so you can see what waiting does to a schedule.
 *
 * `concurrency` is how many tasks may be in flight at once. 1 is "one after another". Notice that
 * a task with no waiting never lets anyone else run, because JavaScript is single threaded: parallelism
 * only helps work that waits.
 *
 * With a ControlConfig the executor also injects faults, retries transient failures, enforces a
 * timeout, and spends from a shared budget. Each ATTEMPT gets its own span, so a retry shows up on
 * the timeline as a second bar after a red one.
 */
export interface Task<R> {
  id: string;
  label: string;
  /** Simulated waiting time, in milliseconds. 0 means pure computation. */
  latencyMs: number;
  /** What one attempt costs from the budget. Default 1. */
  cost?: number;
  work(): R | Promise<R>;
}

/** When one attempt ran: the raw material for a timeline chart. */
export interface Span {
  stage: string;
  taskId: string;
  label: string;
  /** Which of the concurrent "lanes" ran it. */
  lane: number;
  start: number;
  end: number;
  ok: boolean;
  /** 1 for the first try, 2 for the first retry, and so on. */
  attempt: number;
  /** Why it failed or was not tried: "timeout", "budget" or the error message. */
  note?: string;
}

export interface TaskResult<R> {
  ok: boolean;
  value?: R;
  error?: string;
  /** "budget" when the task was never tried because the money ran out. */
  reason?: "budget" | "timeout" | "error";
  /** The last attempt. */
  span: Span;
  /** Every attempt, in order. */
  attempts: Span[];
}

const isPromise = (x: unknown): x is Promise<unknown> => typeof (x as { then?: unknown })?.then === "function";

async function runOne<R>(stage: string, task: Task<R>, lane: number, clock: Clock, control: ControlConfig | undefined): Promise<TaskResult<R>> {
  const retry = control?.retry ?? { maxAttempts: 1, backoffMs: 0 };
  const faults = faultsFor(control, stage, task.id);
  const cost = task.cost ?? 1;
  const attempts: Span[] = [];
  let lastError = "";
  let reason: TaskResult<R>["reason"] = "error";

  const span = (start: number, attempt: number, ok: boolean, note?: string): Span => ({
    stage, taskId: task.id, label: task.label, lane, start, end: clock.now(), ok, attempt, note,
  });

  for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
    // The budget is checked before every attempt, so retries spend money too.
    if (control?.budget && control.budget.spent + cost > control.budget.maxUnits) {
      lastError = "budget exhausted";
      reason = "budget";
      attempts.push(span(clock.now(), attempt, false, "budget"));
      break;
    }
    if (control?.budget) control.budget.spent += cost;

    const start = clock.now();
    const extra = faults.filter((f) => f.kind === "slow").reduce((n, f) => n + (f.extraMs ?? 0), 0);
    const hangs = faults.some((f) => f.kind === "hang");
    const wait = hangs ? HANG_MS : task.latencyMs + extra;

    let value: R | undefined;
    let error: TaskError | undefined;
    let note: string | undefined;

    if (control?.timeoutMs !== undefined && wait > control.timeoutMs) {
      // We know how long this attempt would take, so we give up exactly at the timeout.
      // (With a real network call you would race it against a timer instead.)
      await clock.sleep(control.timeoutMs);
      error = new TaskError(`timed out after ${control.timeoutMs} ms`, true);
      note = "timeout";
      reason = "timeout";
    } else {
      if (wait > 0) await clock.sleep(wait);
      const crash = faults.find((f) => f.kind === "crash");
      const flaky = faults.find((f) => f.kind === "flaky" && attempt <= (f.failFirst ?? 1));
      if (hangs) {
        error = new TaskError(`no answer after ${HANG_MS} ms`, true);
        note = "hung";
      } else if (crash) {
        error = new TaskError(`${task.label} crashed (injected)`, false);
      } else if (flaky) {
        error = new TaskError(`${task.label} failed on attempt ${attempt} (injected, transient)`, true);
      } else {
        try {
          const out = task.work();
          // Only wait for a promise if there is one: awaiting plain values would let other lanes sneak in.
          value = (isPromise(out) ? await out : out) as R;
        } catch (e) {
          error = e instanceof TaskError ? e : new TaskError(e instanceof Error ? e.message : String(e), false);
        }
      }
      if (error) reason = note === "hung" ? "timeout" : "error";
    }

    attempts.push(span(start, attempt, !error, note ?? error?.message));
    if (!error) return { ok: true, value, span: attempts.at(-1)!, attempts };

    lastError = error.message;
    const canRetry = error.transient || retry.retryPermanent;
    if (attempt === retry.maxAttempts || !canRetry) break;
    const backoff = retry.backoffMs * 2 ** (attempt - 1);
    if (backoff > 0) await clock.sleep(backoff);
  }
  return { ok: false, error: lastError, reason, span: attempts.at(-1)!, attempts };
}

/**
 * Run all the tasks of one stage. Results come back in the order the tasks were given, however
 * they finished. A task that fails does not stop the others: it is recorded as a failure.
 */
export async function runTasks<R>(stage: string, tasks: Task<R>[], concurrency: number, clock: Clock, control?: ControlConfig): Promise<TaskResult<R>[]> {
  const results: TaskResult<R>[] = new Array(tasks.length);
  let next = 0;

  const lane = async (laneIndex: number) => {
    for (;;) {
      const i = next++;
      if (i >= tasks.length) return;
      results[i] = await runOne(stage, tasks[i], laneIndex, clock, control);
    }
  };

  const lanes = Math.min(Math.max(1, Math.floor(concurrency)), Math.max(1, tasks.length));
  await Promise.all(Array.from({ length: lanes }, (_, k) => lane(k)));
  return results;
}
