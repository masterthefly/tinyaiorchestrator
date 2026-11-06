import type { ErrorType } from "../incident/types.ts";
import { ERROR_TYPES, logPrompt, logResponse } from "../model/log-prompt.ts";
import { HELDOUT, TRAIN, type Templates } from "./log-templates.ts";
import { WILD } from "./wild-logs.ts";

/**
 * Builds the training data for the log classifier, and the three test sets.
 *
 *   training   many fills and variations of the TRAIN phrasings
 *   "seen"     fresh fills of the same phrasings (did it learn them?)
 *   "new"      the HELDOUT phrasings it never trained on (does it generalise?)
 *   "wild"     real world style lines, written by hand and used only for testing
 *
 * Every string a test set contains is checked against the training data, so a test question can
 * never be a training example in disguise.
 */
export interface SftExample {
  prompt: string;
  response: string;
}

export type TestSet = "seen" | "new" | "wild";

export interface LabelledLog {
  message: string;
  type: ErrorType;
  set: TestSet;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

const SERVICES = ["payments-api", "checkout", "api-gateway", "db-primary", "auth-service", "batch-worker", "search-api", "cache-redis", "orders-svc", "inventory", "notifier", "billing-worker"];
const HOSTS = ["db-primary", "cache-01", "redis.internal", "10.0.3.14", "10.12.0.7", "api.partner.com", "queue-02", "172.16.4.9"];
const PATHS = ["/var/data/export.csv", "/tmp", "/var/log/app.log", "/checkout", "/api/v1/orders", "/data/uploads", "/var/lib/postgres", "/srv/cache"];
const USERS = ["4412", "alice", "svc_batch", "deploy", "root", "u-7731", "maria", "ops-bot"];

/** An id with at least one digit, so the normaliser treats it as an id and not a word. */
const makeId = (rng: Rng) => `${Math.floor(rng() * 10)}${Math.floor(rng() * 0xfffffff).toString(16).padStart(7, "0")}`;

function fill(template: string, rng: Rng): string {
  return template
    .replace(/\{svc\}/g, () => pick(rng, SERVICES))
    .replace(/\{host\}/g, () => pick(rng, HOSTS))
    .replace(/\{path\}/g, () => pick(rng, PATHS))
    .replace(/\{user\}/g, () => pick(rng, USERS))
    .replace(/\{id\}/g, () => makeId(rng))
    .replace(/\{n\}/g, () => String(1 + Math.floor(rng() * 9000)));
}

/**
 * Key=value decorations real logs carry. They are added to examples of EVERY class on purpose: if only one
 * class ever mentioned a path, the model would learn that the word "path" means that class (it did, in the
 * first version: it labelled gateway errors as disk errors because they said path=/checkout).
 */
const DECORATIONS = ["(req={id})", "(path={path}, req={id})", "[host={host}]", "(trace={id})", "path={path}", "user={user}", "(svc={svc})", "(client={host})"];

/** The small variations real logs have: case, a prefix, a trailing full stop, a key=value tail. */
function vary(message: string, rng: Rng): string {
  let m = message;
  const roll = rng();
  if (roll < 0.15) m = m.toLowerCase();
  else if (roll < 0.25) m = m.charAt(0).toUpperCase() + m.slice(1);
  if (rng() < 0.12) m = `[${pick(rng, SERVICES)}] ${m}`;
  else if (rng() < 0.12) m = `Error: ${m}`;
  if (rng() < 0.12) m += ".";
  if (rng() < 0.3) m += " " + fill(pick(rng, DECORATIONS), rng);
  return m;
}

function generate(templates: Templates, rng: Rng, fillsPerTemplate: number): { message: string; type: ErrorType }[] {
  const out: { message: string; type: ErrorType }[] = [];
  for (const type of ERROR_TYPES) {
    for (const template of templates[type]) {
      for (let k = 0; k < fillsPerTemplate; k++) out.push({ message: vary(fill(template, rng), rng), type });
    }
  }
  return out;
}

function shuffle<T>(xs: T[], rng: Rng): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Training examples. Duplicates (after normalising) are removed, then the order is shuffled. */
export function makeTrainingData(seed = 11, fillsPerTemplate = 40): SftExample[] {
  const rng = mulberry32(seed);
  const seen = new Set<string>();
  const out: SftExample[] = [];
  for (const { message, type } of generate(TRAIN, rng, fillsPerTemplate)) {
    const ex = { prompt: logPrompt(message), response: logResponse(type) };
    const key = ex.prompt + "\u0000" + ex.response;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(ex);
    }
  }
  return shuffle(out, rng);
}

/** The test sets. Nothing in them equals (once normalised) a training prompt. */
export function makeTestSets(seed = 23, perClass = { seen: 24, new: 30 }): LabelledLog[] {
  const trainPrompts = new Set(makeTrainingData().map((e) => e.prompt));
  const rng = mulberry32(seed);
  const taken = new Set<string>();
  const result: LabelledLog[] = [];

  const take = (rows: { message: string; type: ErrorType }[], set: TestSet, limit: number) => {
    const count = new Map<ErrorType, number>();
    for (const row of shuffle(rows, rng)) {
      const prompt = logPrompt(row.message);
      if (trainPrompts.has(prompt) || taken.has(`${set}|${prompt}`)) continue;
      if ((count.get(row.type) ?? 0) >= limit) continue;
      taken.add(`${set}|${prompt}`);
      count.set(row.type, (count.get(row.type) ?? 0) + 1);
      result.push({ ...row, set });
    }
  };

  take(generate(TRAIN, rng, 12), "seen", perClass.seen);
  take(generate(HELDOUT, rng, 12), "new", perClass.new);
  for (const [message, type] of WILD) {
    if (!trainPrompts.has(logPrompt(message))) result.push({ message, type, set: "wild" });
  }
  return result;
}
