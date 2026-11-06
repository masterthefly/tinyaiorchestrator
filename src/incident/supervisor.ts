import type { Supervisor } from "../orchestrator.ts";
import type { CaseFile } from "./types.ts";

/**
 * The supervisor decides who works next by reading the case file. This one is a short list of
 * rules: look at what is missing, and ask the agent who can supply it.
 *
 * It is the part of an orchestrator that people call the "planner". Notice how little it is.
 * It is also the part you would replace to get smarter behaviour, such as skipping an agent or
 * calling several at once. Every decision comes with a reason, which ends up in the trace.
 */
export const incidentSupervisor: Supervisor<CaseFile> = (state) => {
  if (!state.events) return { next: "parser", reason: "nothing has been read yet" };
  if (!state.classified) return { next: "classifier", reason: `${state.events.length} events are not labelled yet` };
  if (!state.incidents) return { next: "correlator", reason: "events are labelled but not grouped into incidents" };

  if (state.incidents.length === 0) return { next: null, reason: "no incidents found, so there is nothing to advise on" };
  const waiting = state.incidents.filter((i) => !i.advice).length;
  if (waiting > 0) return { next: "advisor", reason: `${waiting} incident${waiting === 1 ? " has" : "s have"} no advice yet` };

  const n = state.incidents.length;
  return { next: null, reason: `${n} incident${n === 1 ? "" : "s"} triaged` };
};
