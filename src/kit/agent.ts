import type { Action, Brain, Message, RunResult, Step, Tool } from "./types.ts";

/**
 * The agent loop. This is the heart of every agent, including the big ones:
 *
 *   repeat:
 *     ask the brain what to do next
 *     if it wants a tool, run the tool and show it the result
 *     if it gives a final answer, stop
 *
 * We cap the number of steps so a confused brain can never loop forever.
 */
export function runAgent(
  brain: Brain,
  tools: Tool[],
  question: string,
  maxSteps = 6,
): RunResult {
  const messages: Message[] = [{ role: "user", text: question }];
  const steps: Step[] = [];

  for (let n = 1; n <= maxSteps; n++) {
    const action: Action = brain.next(messages);

    if (action.type === "final") {
      steps.push({ n, action });
      return { answer: action.text, steps, stopped: "final" };
    }

    const observation = callTool(tools, action);
    steps.push({ n, action, observation });
    messages.push({ role: "tool", tool: action.tool, args: action.args, text: observation });
  }

  return { answer: "I ran out of steps.", steps, stopped: "max_steps" };
}

/** Run a tool call. Mistakes become text the brain can read, never crashes. */
export function callTool(tools: Tool[], call: Extract<Action, { type: "tool_call" }>): string {
  const tool = tools.find((t) => t.name === call.tool);
  if (!tool) {
    return `Error: no tool called "${call.tool}". Available: ${tools.map((t) => t.name).join(", ")}`;
  }
  try {
    return tool.run(call.args);
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}
