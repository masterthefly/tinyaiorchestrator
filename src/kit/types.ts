// The whole agent is built from these few shapes. Read this file first.

/** One entry in the conversation the brain sees. */
export type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | { role: "tool"; tool: string; args: Record<string, string>; text: string };

/** What the brain decides to do next: call a tool, or give the final answer. */
export type Action =
  | { type: "tool_call"; tool: string; args: Record<string, string> }
  | { type: "final"; text: string };

/** The brain: looks at the conversation so far and picks the next action. */
export interface Brain {
  name: string;
  next(messages: Message[]): Action;
}

/** A tool the agent can use. It takes string arguments and returns text. */
export interface Tool {
  name: string;
  description: string;
  run(args: Record<string, string>): string;
}

/** One step of the loop, recorded so you can see exactly what happened. */
export interface Step {
  n: number;
  action: Action;
  observation?: string;
}

export interface RunResult {
  answer: string;
  steps: Step[];
  /** Why the loop stopped. */
  stopped: "final" | "max_steps";
}
