# The agent kit

The two files in this folder are copied, unchanged, from
[tinyagentbuilder](https://github.com/masterthefly/tinyagentbuilder) (MIT, same author):

| File | What it is |
|---|---|
| `types.ts` | The few shapes everything is built from: `Message`, `Action`, `Brain`, `Tool` |
| `agent.ts` | The agent loop: ask the brain, run the tool, repeat, stop |

One agent is already a solved, small problem. This project starts where that one stops: what happens when you have
several of them. The kit is copied, not installed, so this repository keeps its promise of having no dependencies.
The Advisor agent in `src/incident/advisor.ts` is built on it. If you want to understand these files, that repository
is the place to start.
