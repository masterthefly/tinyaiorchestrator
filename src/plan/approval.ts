import type { Incident, Severity } from "../incident/types.ts";

/**
 * The human approval gate.
 *
 * An agent that can ACT (send a message, restart a service, spend money) is riskier than one that
 * only reads. The usual safeguard is to split "propose" from "do": the team drafts the action,
 * low risk actions go out by themselves, and risky ones wait for a person. Every step is written
 * to an audit log, so you can answer "who allowed this, and when?" afterwards.
 *
 * Nothing here sends anything. "Sending" means adding to a simulated outbox.
 */
export interface Notification {
  id: string;
  incidentId: string;
  /** The team to page. */
  to: string;
  severity: Severity;
  subject: string;
  body: string;
  status: "pending_approval" | "auto_sent" | "sent" | "rejected";
}

export interface AuditEntry {
  /** 1, 2, 3 ...: the order things happened in. */
  seq: number;
  actor: string;
  action: "drafted" | "auto_sent" | "approved" | "rejected";
  target: string;
  detail: string;
}

export interface ApprovalPolicy {
  /** Severities that need a person to approve. Anything else is sent automatically. */
  requireFor: Severity[];
}

export const defaultApprovalPolicy: ApprovalPolicy = { requireFor: ["critical", "major"] };

export interface ApprovalState {
  notifications: Notification[];
  /** The simulated outbox: what has "gone out". */
  sent: Notification[];
  audit: AuditEntry[];
}

const log = (audit: AuditEntry[], actor: string, action: AuditEntry["action"], target: string, detail: string): AuditEntry[] => [
  ...audit,
  { seq: audit.length + 1, actor, action, target, detail },
];

function draft(incident: Incident, caveat: string | undefined, defaultOwner: string): Notification {
  // An incident must never drop out of the list because advice failed: say so and send it to someone.
  const advice = incident.advice;
  const first = advice?.steps[0] ? ` First thing to try: ${advice.steps[0]}.` : "";
  const fallback = !advice ? " No advice could be produced for this incident." : advice.source === "fallback" ? " The advice here is a generic fallback, not a real runbook." : "";
  // A message people will act on must carry its own doubts. A degraded run can still look confident.
  const doubt = caveat ? ` CAUTION: ${caveat}.` : "";
  return {
    id: `N-${incident.id}`,
    incidentId: incident.id,
    to: advice?.owner ?? defaultOwner,
    severity: incident.severity,
    subject: `[${incident.severity.toUpperCase()}] ${incident.id}: ${incident.origin.type} errors starting at ${incident.origin.service}`,
    body: `Likely origin ${incident.origin.service} (${incident.origin.type}). Spread: ${incident.services.join(" > ")}. ${incident.errorCount} errors.${first}${fallback}${doubt}`,
    status: "pending_approval",
  };
}

/**
 * Draft a notification for each incident. Low risk ones go out at once; the rest wait.
 * `caveat`, when given, is written into every message (for example "this report is based on incomplete data").
 */
export function draftNotifications(incidents: Incident[], policy: ApprovalPolicy = defaultApprovalPolicy, caveat?: string, defaultOwner = "the on call engineer"): ApprovalState {
  let state: ApprovalState = { notifications: [], sent: [], audit: [] };
  for (const incident of incidents) {
    const n = draft(incident, caveat, defaultOwner);
    state ={ ...state, audit: log(state.audit, "system", "drafted", n.id, `to ${n.to}, ${n.severity}`) };
    if (policy.requireFor.includes(n.severity)) {
      state = { ...state, notifications: [...state.notifications, n] };
    } else {
      const out = { ...n, status: "auto_sent" as const };
      state = {
        notifications: [...state.notifications, out],
        sent: [...state.sent, out],
        audit: log(state.audit, "system", "auto_sent", n.id, `${n.severity} is below the approval threshold`),
      };
    }
  }
  return state;
}

/** A person decides. A decided notification cannot be decided again. */
export function decide(state: ApprovalState, id: string, decision: "approve" | "reject", actor: string, reason = ""): ApprovalState {
  const target = state.notifications.find((n) => n.id === id);
  if (!target) throw new Error(`There is no notification "${id}".`);
  if (target.status !== "pending_approval") throw new Error(`${id} is already ${target.status}, so it cannot be decided again.`);

  const updated: Notification = { ...target, status: decision === "approve" ? "sent" : "rejected" };
  return {
    notifications: state.notifications.map((n) => (n.id === id ? updated : n)),
    sent: decision === "approve" ? [...state.sent, updated] : state.sent,
    audit: log(state.audit, actor, decision === "approve" ? "approved" : "rejected", id, reason || `${decision === "approve" ? "approved" : "rejected"} by ${actor}`),
  };
}

export const pending = (state: ApprovalState) => state.notifications.filter((n) => n.status === "pending_approval");
