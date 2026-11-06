import type { Agent } from "../orchestrator.ts";
import { runAgent } from "../kit/agent.ts";
import type { Action, Brain, Message, Step, Tool } from "../kit/types.ts";
import { sampleKnowledge, type KnowledgeBase } from "./runbooks.ts";
import type { CaseFile, ErrorType, Incident } from "./types.ts";

/**
 * Agent 4: the Advisor. For each incident it looks up what to do and who to call.
 *
 * The other three agents are plain code. This one is a real tool using agent, built on the
 * same loop as the first project: it asks for the `runbook` tool, then the `owner` tool, then
 * writes its answer. Its brain is scripted today. Because it is just a `Brain`, a language
 * model can take its place later and the rest of the team will not notice.
 */

const STEP_SEPARATOR = " | ";

export function advisorTools(kb: KnowledgeBase): Tool[] {
  return [
    {
      name: "runbook",
      description: "Steps to try for a kind of problem. Args: key (the error type)",
      run: ({ key }) => {
        const steps = kb.runbooks[(key ?? "") as ErrorType];
        if (!steps) throw new Error(`no runbook for "${key}"`);
        return steps.join(STEP_SEPARATOR);
      },
    },
    {
      name: "owner",
      description: "Which team owns a service. Args: key (the service name)",
      run: ({ key }) => kb.owners[key ?? ""] ?? kb.defaultOwner,
    },
  ];
}

/** The question the advisor is asked about one incident, as one line of text. */
export function describeIncident(i: Incident): string {
  return `Incident ${i.id}: severity=${i.severity} origin=${i.origin.service} type=${i.origin.type} spread=${i.services.join(">")}`;
}

/** A brain that follows a fixed routine: runbook, then owner, then answer. */
export const advisorBrain: Brain = {
  name: "advisor routine",
  next(messages: Message[]): Action {
    const question = messages[0].role === "user" ? messages[0].text : "";
    const type = /type=(\w+)/.exec(question)?.[1] ?? "unknown";
    const service = /origin=(\S+)/.exec(question)?.[1] ?? "unknown";
    const done = messages.filter((m) => m.role === "tool");

    if (done.length === 0) return { type: "tool_call", tool: "runbook", args: { key: type } };
    if (done.length === 1) return { type: "tool_call", tool: "owner", args: { key: service } };

    const runbook = done[0].text;
    const owner = done[1].text;
    const first = runbook.startsWith("Error")
      ? "There is no runbook for this kind of error, so start by reading the top messages."
      : `First steps: ${runbook.split(STEP_SEPARATOR).slice(0, 3).map((s, n) => `${n + 1}) ${s}`).join(" ")}.`;
    return { type: "final", text: `Likely origin: ${service} (${type}). Owner: ${owner}. ${first}` };
  },
};

export function createAdvisor(kb: KnowledgeBase = sampleKnowledge, maxIncidents = 5): Agent<CaseFile> {
  const tools = advisorTools(kb);
  return {
    name: "advisor",
    description: "Looks up runbook steps and the owning team for each incident, using tools.",
    kind: "tools",
    run(state) {
      const incidents = (state.incidents ?? []).slice();
      const steps: Step[] = [];
      let advised = 0;

      for (let k = 0; k < incidents.length && advised < maxIncidents; k++) {
        const incident = incidents[k];
        if (incident.advice) continue;
        const run = runAgent(advisorBrain, tools, describeIncident(incident));
        steps.push(...run.steps);

        const runbookStep = run.steps.find((s) => s.action.type === "tool_call" && s.action.tool === "runbook");
        const ownerStep = run.steps.find((s) => s.action.type === "tool_call" && s.action.tool === "owner");
        const owner = ownerStep?.observation ?? kb.defaultOwner;
        const found = runbookStep && !runbookStep.observation?.startsWith("Error");
        incidents[k] = {
          ...incident,
          advice: {
            owner,
            steps: found ? runbookStep.observation!.split(STEP_SEPARATOR) : [],
            text: run.answer,
            source: "advisor",
          },
        };
        advised++;
      }
      return {
        state: { ...state, incidents },
        summary: `advised on ${advised} incident${advised === 1 ? "" : "s"} using the runbook and owner tools`,
        steps,
      };
    },
  };
}

export const advisorAgent = createAdvisor();
