/**
 * A made up ten minute slice of production logs, built the same way every time.
 *
 * The story: at 09:04 the database runs out of connections. Within a minute the payments service
 * cannot reach it, then checkout fails because payments is failing, then the gateway fails because
 * checkout is failing. Around it sits ordinary noise: heartbeats, one unrelated disk error, two
 * login warnings, and a few lines that are not log lines at all.
 *
 * Three services use three different log formats, so the Parser has real work to do.
 */

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

interface RawEvent {
  t: number; // seconds after 09:00:00 UTC
  service: string;
  level: "INFO" | "WARN" | "ERROR";
  msg: string;
}

const START = Date.UTC(2026, 10, 6, 9, 0, 0);
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

function format(e: RawEvent): string {
  const d = new Date(START + e.t * 1000);
  const iso = d.toISOString().replace(".000Z", "Z");
  if (e.service === "batch-worker") {
    const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    return `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())},000 [${e.service}] ${e.level} ${e.msg}`;
  }
  if (e.service === "auth-service") {
    return JSON.stringify({ ts: iso, service: e.service, level: e.level.toLowerCase(), msg: e.msg });
  }
  return `${iso} ${e.service} ${e.level} ${e.msg}`;
}

export function generateSampleLog(): string {
  const rng = mulberry32(7);
  const hex = () => Math.floor(rng() * 0xffffff).toString(16).padStart(6, "0");
  const events: RawEvent[] = [];
  const add = (t: number, service: string, level: RawEvent["level"], msg: string) => events.push({ t, service, level, msg });

  // Ordinary traffic, all ten minutes.
  const routine: [string, () => string][] = [
    ["api-gateway", () => `request completed in ${40 + Math.floor(rng() * 80)}ms`],
    ["checkout", () => `order ${hex()} created`],
    ["payments-api", () => `payment authorised in ${60 + Math.floor(rng() * 90)}ms`],
    ["db-primary", () => "checkpoint complete"],
    ["auth-service", () => `token issued for user ${1000 + Math.floor(rng() * 9000)}`],
    ["batch-worker", () => "export job heartbeat"],
  ];
  for (let t = 0; t < 600; t += 6 + Math.floor(rng() * 8)) {
    const [service, msg] = routine[Math.floor(rng() * routine.length)];
    add(t, service, "INFO", msg());
  }

  // The incident: a database problem that spreads.
  add(250, "db-primary", "WARN", "connection pool near capacity (95/100)");
  for (let k = 0; k < 3; k++) add(280 + k * 7, "db-primary", "ERROR", "connection pool exhausted: 100/100 connections in use");
  for (let k = 0; k < 8; k++) add(295 + k * 9, "payments-api", "ERROR", `Timeout connecting to db-primary after 30s (req=${hex()})`);
  for (let k = 0; k < 6; k++) add(320 + k * 11, "checkout", "ERROR", `upstream payments-api returned 502 Bad Gateway for order ${hex()}`);
  for (let k = 0; k < 5; k++) add(340 + k * 13, "api-gateway", "ERROR", `503 Service Unavailable from checkout (path=/checkout, req=${hex()})`);

  // Unrelated noise: a disk warning and error, and two login warnings.
  add(120, "batch-worker", "WARN", "disk usage 91% on /var/data");
  add(560, "batch-worker", "ERROR", "No space left on device writing /var/data/export.csv");
  add(500, "auth-service", "WARN", "Invalid token for user 4412");
  add(502, "auth-service", "WARN", "Invalid token for user 4412");

  events.sort((a, b) => a.t - b.t);
  const lines = events.map(format);

  // Lines that are not log lines at all, as real files have.
  lines.splice(12, 0, "---- log rotated ----");
  lines.splice(70, 0, "(output truncated)");
  lines.splice(110, 0, "");
  lines.splice(111, 0, "-- reconnecting to log shipper --");
  return lines.join("\n") + "\n";
}
