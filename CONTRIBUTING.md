# Contributing to TinyAIOrchestrator

Thank you for wanting to help. This is a **teaching project**: a team of agents small enough to read in an afternoon,
a supervisor that runs them, and a page that shows what each one is doing. Contributions that make it clearer, more
correct or more useful to a learner are all welcome, and you do not need to be a machine learning expert.

Please be kind and patient with each other. Assume good intentions, explain your reasoning, and keep feedback about the
code, not the person.

## Ways to help

New here? Look for issues labelled [good first issue](https://github.com/masterthefly/tinyaiorchestrator/labels/good%20first%20issue).

- **Report a bug or a confusing explanation.** A line in the page that misled you is as valuable as a crash.
- **Add a log format** the Parser cannot read yet (`src/incident/parser.ts`), with a test that includes lines it should reject.
- **Add or fix a classifier rule** (`src/incident/classifier.ts`), ideally with a real world wording the rules miss.
- **Add test lines** to the hand written "wild" set (`src/data/wild-logs.ts`), especially ones the model gets wrong.
- **Write a connector** for a place logs live (`src/connectors.ts`).
- **Add a failure** to the chaos tour (`src/chaos-cli.ts`) and say what it teaches.
- **Try it in another browser or on another operating system.** Only Chromium has been tested so far.

If you are unsure whether an idea fits, open an issue first and describe what you would like to change and why.

## Set up

You need [Node.js](https://nodejs.org/) 22.18 or newer (24 recommended). There is nothing to install: the project has no
dependencies, and Node runs the TypeScript directly.

```bash
npm test                      # all tests, a few seconds
npm run triage -- sample      # the team on the built in example
npm run plan -- sample        # does running tasks side by side help? measured
npm run chaos                 # a tour of failures
npm run eval:classifier       # rules, model and hybrid, with error bars
npm run compare               # one plain function against the whole team
npm run build:web             # builds the page
npm run serve                 # serves the page at http://localhost:8080
```

## Where things live

| You want to change | Look in |
|---|---|
| The supervisor loop, trace and cost | `src/orchestrator.ts` |
| The four agents and the supervisor rules | `src/incident/` |
| The planner, executor, retries, budget, approval | `src/plan/` |
| The classifier model's prompt and wrapper | `src/model/` |
| Training templates, wild test lines, the generator | `src/data/`, written to `data/` by `npm run data:log` |
| Scoring a classifier | `src/eval/` |
| The one function comparison | `src/compare/` |
| The page | `web/index.html`, `web/app.js`, `web/gantt.js`, `web/style.css` |
| The model and WebAssembly engine | `web/model/`, `web/vendor/tlm/` (built by [TinyLanguageBuilder](https://github.com/masterthefly/tinylanguagebuilder)) |

`web/js/`, `web/src/` and `web/data/` are **build output**. `npm run build:web` recreates them from `src/` and `data/`,
and they are git ignored on purpose. Edit the TypeScript in `src/`, never the generated JavaScript.

## Making a change

1. **Keep it focused.** One idea per pull request is much easier to review than several.
2. **Write the test with the change.** Tests live in `test/` and use Node's built in test runner. Timing tests use a
   virtual clock so the numbers are exact: assert exact numbers, not "faster than".
3. **Keep the code readable.** This project is meant to be read, so prefer clear code over clever code, and write
   comments that explain *why*, not *what*.
4. **Keep the project's promises.** No dependencies and no build tool beyond Node itself. Everything runs in a browser
   tab or on your own computer. Nothing the user connects is sent to a server. If a dependency seems necessary, explain
   why in an issue first.
5. **One format, one source of truth.** If you change `logPrompt` or the training data, the small model must be
   retrained, because it only understands the exact format it was trained on. `test/model.test.ts` fails when that happens.
6. **Say what a number does and does not show.** Scores come with a range, tests are held out from training, and a
   degraded result must say it is degraded.

### Retraining the classifier model

The model in `web/model/` was fine tuned from a small base model with the `tlm` command line tool from
[TinyLanguageBuilder](https://github.com/masterthefly/tinylanguagebuilder). To retrain:

```bash
npm run data:log              # regenerate data/log-train.jsonl and data/log-eval.json
# then, inside a TinyLanguageBuilder checkout with its base model (runs/base-med):
tlm sft --base runs/base-med --out runs/log-classifier-v4 --data ../tinyaiorchestrator/data/log-train.jsonl --steps 4000 --seed 1
```

Copy `model.safetensors` and `tokenizer.json` from the new run into `web/model/`, then run `npm run eval:classifier`.
Read the training log: `tlm sft` prints how many examples fit the model's 64 token window, and silently drops the rest.
That number should equal the number of examples.

## Reporting results

The test sets are small. If you report that a change improved a score, please say how many cases it was measured on and
give the range. Negative and noisy results are useful, so please share them too.

## Pull requests

- Describe what changed and why, and how you tested it. The pull request template has a short checklist.
- Make sure `npm test` passes and that you looked at any visible change in a browser. A passing test does not prove a
  page looks right.
- Do not commit build output (`web/js/`, `web/src/`, `web/data/`).
- Small, clearly explained pull requests get reviewed fastest.

## License

By contributing you agree that your contribution is licensed under the project's [MIT License](LICENSE).
