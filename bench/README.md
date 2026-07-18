# Bench

Automated benchmarking tooling for the prompts in this repo: runs each prompt against
multiple model providers, scores the outputs with a fixed LLM judge against the
prompt's existing rubric, and generates a static HTML report.

## Setup

```
bun install
cp .env.example .env   # fill in the API keys for the providers you want to use
```

Configure models with the `models` commands below. Local configuration is stored
in `bench/models.json` and is gitignored; the repo ships
`bench/models.example.json` as the starting template.

## Usage

Run from the repo root:

```
bun bench/src/cli.ts list
bun bench/src/cli.ts models list
bun bench/src/cli.ts models init
bun bench/src/cli.ts run all --dry-run
bun bench/src/cli.ts run debugging/javascript-debounce --models anthropic:sonnet,openai:gpt-4o-mini
bun bench/src/cli.ts report
```

Or via the package script alias: `bun run bench <subcommand> ...`.

### `models`

Initialize local model configuration:

```
bun run bench models init
```

List or validate configured models:

```
bun run bench models list
bun run bench models validate
```

Set the default judge:

```
bun run bench models set-judge local:gemma
```

Add a local or hosted OpenAI-compatible model:

```
bun run bench models add-openai-compatible \
  --id local:my-model \
  --provider llama-swap \
  --model my-model-name \
  --base-url http://localhost:8080/v1 \
  --max-concurrent 1
```

For providers that require extra headers, repeat `--header Name=Value`:

```
bun run bench models add-openai-compatible \
  --id openrouter:custom \
  --provider openrouter \
  --model provider/model-name \
  --base-url https://openrouter.ai/api/v1 \
  --api-key-env OPENROUTER_API_KEY \
  --header HTTP-Referer=https://github.com/model-prompt-tests \
  --header X-Title="model-prompt-tests bench"
```

Add an Anthropic model:

```
bun run bench models add-anthropic \
  --id anthropic:custom \
  --model claude-sonnet-5 \
  --api-key-env ANTHROPIC_API_KEY
```

Judge-only models can be added with `--disabled`, which keeps them available for
`--judge` / `BENCH_JUDGE_MODEL_ID` without including them in default `run all`.

### `run <prompt-glob-or-all>`

- `--models id1,id2` — restrict to specific model matrix ids (default: enabled configured models).
- `--judge <id>` — override the judge model for this run (default: `judge.modelId` in model config, or `BENCH_JUDGE_MODEL_ID`).
- `--judges id1,id2` — score every run with multiple judges instead of one (mutually exclusive with `--judge`); each ok run gets one `scores` row per judge.
- `--concurrency <n>` — default per-provider concurrency (individual matrix entries can set their own `maxConcurrent`, e.g. for single-GPU local servers).
- `--repeats <n>` — run each (prompt, model) cell `n` times independently (default 1). Useful for measuring variance; see "Aggregation" below for how repeats factor into the report.
- `--dry-run` — resolve and print the prompt x model matrix with zero network calls.
- `--no-judge` — skip LLM-judge scoring.

Provider calls time out after 120 seconds by default. Matrix entries can override this
with `timeoutMs`. A completed batch exits nonzero if any candidate or judge request
failed, while still storing successful and failed results for reporting.

### `report`

- `--out <path>` — write to a specific path (default: `bench/reports/<timestamp>.html`, always also mirrored to `bench/reports/latest.html`).
- `--batch <run_batch_id>` — restrict the report to one `run` invocation.
- `--all-runs` — show full run history per (prompt, model) instead of just the latest batch per cell.
- `--narrative` — append an LLM-written analysis paragraph to the assessment (see below); calls the default judge model, so this makes network calls. Off by default.
- `--judge <id>` — which judge model writes the `--narrative` analysis (default: the same judge resolution as `run`).

Every `report` invocation writes three files (plus `latest.*` mirrors):
`<timestamp>.html` (the prompt x model matrix), `<timestamp>.summary.json` (per-model
`ModelSummary` stats), and `<timestamp>.assessment.md` (a deterministic markdown writeup —
model summary table, per-dimension averages, per-prompt winners, judge-disagreement
flags, and an error inventory — generated from the same data as the HTML report).

## Aggregation

By default `report` shows only the most recent `run` batch for each (prompt, model)
cell, but keeps every repeat within that batch (`--all-runs` shows full history instead).
A single run's judge scores collapse to one number via the **median across judges**
(not the mean), so one outlier judge doesn't skew a run's score. When `--repeats > 1`,
a cell's repeats collapse the same way: **median across repeats**. A model's `avgScore`
is the mean of its per-cell medians, so a prompt run many times doesn't dominate a
prompt run once. `scoreStdDev` is computed across all individual run scores;
`repeatVariance` is the mean of per-cell score stddevs (only meaningful once
`--repeats > 1`); `judgeAgreementPct` is the share of multi-judge runs where every judge
gave the exact same integer score.

## Scoring Dimensions

Prompt files can add an optional `## Scoring Dimensions` section (see
`templates/prompt-test.md`) listing 2-5 weighted dimensions, e.g.:

```markdown
## Scoring Dimensions

- `correctness` (weight 3): Identifies the missing clearTimeout and explains why calls stack.
- `code-quality` (weight 2): Fix preserves `this`/args; minimal.
```

When present, the judge is asked to score each dimension (1-5) in addition to the
holistic rubric score, and a weighted score (`sum(weight * score) / sum(weight)`) is
computed and stored alongside it. Prompts without this section are scored exactly as
before — it's fully optional and backward compatible.

## Storage

Results are stored in `bench/data/bench.sqlite` (`runs` and `scores` tables, gitignored).
Schema migrations for new columns are applied automatically on open
(`bench/src/db/client.ts`), so existing databases upgrade in place.

## Phase 2 (not yet implemented)

`bench/src/providers/harness.ts` sketches an `AgentHarness` interface for running
prompts through real tool-using coding agents (Claude Code, Codex CLI, Opencode, OMP)
instead of a plain single-turn API call. The runner/db/judge/report layers depend on
the narrow `CandidateRunner` interface (`bench/src/runner/candidateRunner.ts`) rather
than directly on model adapters, so adding harness support later shouldn't require
changes to those layers.
