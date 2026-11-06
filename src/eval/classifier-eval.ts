import type { ErrorType } from "../incident/types.ts";
import type { Classify } from "../incident/classifier.ts";
import type { LabelledLog, TestSet } from "../data/log-data.ts";

/**
 * Scoring a classifier, and saying how far to trust the score.
 *
 * A score is only useful with its uncertainty. 55 of 72 is "76%", but with 72 test lines the true
 * rate could plausibly be anywhere from about 65% to 85%. The Wilson interval below gives that range.
 */

/** The range of true rates that could plausibly give k right answers out of n. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0];
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (centre - margin) / denom), Math.min(1, (centre + margin) / denom)];
}

export interface SetScore {
  set: TestSet;
  right: number;
  total: number;
  /** Plausible range of the true accuracy. */
  low: number;
  high: number;
  /** Per type: how many of that type were labelled correctly. */
  byType: Partial<Record<ErrorType, { right: number; total: number }>>;
  wrong: { message: string; truth: ErrorType; said: ErrorType }[];
}

export function scoreClassifier(classify: Classify, tests: LabelledLog[]): Record<TestSet, SetScore> {
  const sets: TestSet[] = ["seen", "new", "wild"];
  const out = {} as Record<TestSet, SetScore>;
  for (const set of sets) {
    const rows = tests.filter((t) => t.set === set);
    const byType: SetScore["byType"] = {};
    const wrong: SetScore["wrong"] = [];
    let right = 0;
    for (const row of rows) {
      const said = classify(row.message);
      const slot = (byType[row.type] ??= { right: 0, total: 0 });
      slot.total++;
      if (said === row.type) {
        right++;
        slot.right++;
      } else {
        wrong.push({ message: row.message, truth: row.type, said });
      }
    }
    const [low, high] = wilson(right, rows.length);
    out[set] = { set, right, total: rows.length, low, high, byType, wrong };
  }
  return out;
}

/** True when two accuracy ranges do not overlap, so the difference is unlikely to be chance. */
export const clearlyDifferent = (a: SetScore, b: SetScore) => a.high < b.low || b.high < a.low;
