/**
 * Time, as something you can pass in.
 *
 * Anything that waits (a network call, a model, a sleep) needs a clock. If the code reaches for the
 * real one directly, tests have to really wait, and they get slow and flaky. So the executor takes a
 * Clock. The real one uses the machine's time. The virtual one lets a test say "a task that takes 300
 * milliseconds" and finish instantly, with exact numbers.
 */
export interface Clock {
  /** Milliseconds since some fixed start. */
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = {
  now: () => performance.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface VirtualClock extends Clock {
  /** Run a promise to completion, advancing virtual time whenever everything is waiting. */
  run<T>(work: Promise<T>): Promise<T>;
}

/** A tick that lets every pending promise callback run before we decide what to do next. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function createVirtualClock(): VirtualClock {
  let time = 0;
  const timers: { at: number; wake: () => void }[] = [];

  return {
    now: () => time,
    sleep: (ms) => new Promise<void>((resolve) => timers.push({ at: time + ms, wake: resolve })),
    async run<T>(work: Promise<T>): Promise<T> {
      let finished = false;
      let value!: T;
      let failure: unknown;
      let failed = false;
      work.then(
        (v) => ((value = v), (finished = true)),
        (e) => ((failure = e), (failed = true), (finished = true)),
      );

      let idle = 0;
      while (!finished) {
        await tick();
        if (finished) break;
        if (timers.length === 0) {
          // Nothing is waiting on time, so only a bug can keep us here. Do not spin forever.
          if (++idle > 50) throw new Error("virtual clock: the work is stuck and no timer is pending");
          continue;
        }
        idle = 0;
        // Jump to the earliest timer and wake everything due at that moment together.
        const next = Math.min(...timers.map((t) => t.at));
        time = Math.max(time, next);
        for (const t of timers.filter((x) => x.at <= time)) {
          timers.splice(timers.indexOf(t), 1);
          t.wake();
        }
      }
      if (failed) throw failure;
      return value;
    },
  };
}
