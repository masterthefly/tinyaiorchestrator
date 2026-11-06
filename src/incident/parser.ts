import type { Agent } from "../orchestrator.ts";
import type { CaseFile, LogEvent, LogLevel } from "./types.ts";

/**
 * Agent 1: the Parser. Turns raw log text into structured events.
 *
 * Logs come in many shapes. This reads three common ones:
 *   2026-11-06T09:04:40Z payments-api ERROR Timeout connecting to db
 *   2026-11-06 09:04:40,123 [payments-api] ERROR Timeout connecting to db
 *   {"ts":"2026-11-06T09:04:40Z","service":"payments-api","level":"error","msg":"Timeout connecting to db"}
 * Lines it cannot read are counted, never silently dropped.
 */

const LEVEL = "DEBUG|INFO|NOTICE|WARN(?:ING)?|ERROR|ERR|FATAL|CRITICAL|SEVERE";
const ISO_LINE = new RegExp(`^(\\d{4}-\\d{2}-\\d{2}T[\\d:.]+(?:Z|[+-]\\d{2}:?\\d{2})?)\\s+(\\S+)\\s+(${LEVEL})\\s+(.*)$`, "i");
const BRACKET_LINE = new RegExp(`^(\\d{4}-\\d{2}-\\d{2})[ T](\\d{2}:\\d{2}:\\d{2})(?:[,.](\\d+))?\\s+\\[([^\\]]+)\\]\\s+(${LEVEL})\\s+(.*)$`, "i");

export function normalizeLevel(raw: string): LogLevel | null {
  const s = raw.toLowerCase();
  if (s === "debug") return "debug";
  if (s === "info" || s === "notice") return "info";
  if (s.startsWith("warn")) return "warn";
  if (s === "error" || s === "err" || s === "severe") return "error";
  if (s === "fatal" || s === "critical") return "fatal";
  return null;
}

/** An ISO time with no zone is read as UTC, so the same log gives the same answer everywhere. */
function parseTime(iso: string): number {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso);
  return Date.parse(hasZone ? iso : `${iso}Z`);
}

export function parseLine(line: string): LogEvent | null {
  const text = line.trim();
  if (!text) return null;

  if (text.startsWith("{")) {
    try {
      const o = JSON.parse(text) as Record<string, unknown>;
      const ts = String(o.ts ?? o.time ?? o.timestamp ?? "");
      const level = normalizeLevel(String(o.level ?? o.severity ?? ""));
      const message = String(o.msg ?? o.message ?? "");
      const time = parseTime(ts);
      if (!level || !message || Number.isNaN(time)) return null;
      return { time, service: String(o.service ?? o.app ?? o.logger ?? "unknown"), level, message };
    } catch {
      return null;
    }
  }

  let m = ISO_LINE.exec(text);
  if (m) {
    const level = normalizeLevel(m[3]);
    const time = parseTime(m[1]);
    return level && !Number.isNaN(time) ? { time, service: m[2], level, message: m[4] } : null;
  }

  m = BRACKET_LINE.exec(text);
  if (m) {
    const millis = (m[3] ?? "0").padEnd(3, "0").slice(0, 3);
    const time = parseTime(`${m[1]}T${m[2]}.${millis}`);
    const level = normalizeLevel(m[5]);
    return level && !Number.isNaN(time) ? { time, service: m[4], level, message: m[6] } : null;
  }
  return null;
}

export const parserAgent: Agent<CaseFile> = {
  name: "parser",
  description: "Reads raw log text and turns each line into a structured event.",
  kind: "code",
  run(state) {
    const lines = state.raw.split(/\r?\n/).filter((l) => l.trim() !== "");
    const events: LogEvent[] = [];
    let unparsed = 0;
    for (const line of lines) {
      const e = parseLine(line);
      if (e) events.push(e);
      else unparsed++;
    }
    if (events.length === 0) {
      throw new Error(`no line could be read as a log event (${lines.length} lines tried). Supported: ISO time, [bracket] and JSON lines.`);
    }
    events.sort((a, b) => a.time - b.time);
    return {
      state: { ...state, events, unparsedLines: unparsed },
      summary: `read ${events.length} of ${lines.length} lines${unparsed ? `, ${unparsed} unreadable` : ""}`,
    };
  },
};
