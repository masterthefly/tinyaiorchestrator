import { orchestrate, type Agent, type Outcome } from "../orchestrator.ts";
import { createAdvisor } from "./advisor.ts";
import { classifierAgent } from "./classifier.ts";
import { correlatorAgent } from "./correlator.ts";
import { parserAgent } from "./parser.ts";
import { sampleKnowledge, type KnowledgeBase } from "./runbooks.ts";
import { incidentSupervisor } from "./supervisor.ts";
import { newCase, type CaseFile } from "./types.ts";

/**
 * The four agents, in the order they usually work. The classifier can be swapped for another one
 * (rules, a trained model, or a mix): the team neither knows nor cares, because every classifier
 * is just an agent that labels events.
 */
export function createIncidentTeam(kb: KnowledgeBase = sampleKnowledge, classifier: Agent<CaseFile> = classifierAgent): Agent<CaseFile>[] {
  return [parserAgent, classifier, correlatorAgent, createAdvisor(kb)];
}

/** Triage a log: raw text in, a finished case file and a full trace out. */
export function triage(raw: string, kb: KnowledgeBase = sampleKnowledge, classifier: Agent<CaseFile> = classifierAgent): Outcome<CaseFile> {
  return orchestrate(newCase(raw), createIncidentTeam(kb, classifier), incidentSupervisor);
}
