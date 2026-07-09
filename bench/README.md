# Bench

Automated benchmarking tooling for the prompts in this repo: runs each prompt against
multiple model providers, scores the outputs with a fixed LLM judge against the
prompt's existing rubric, and generates a static HTML report.

## Setup

```
bun install
cp .env.example .env   # fill in the API keys for the providers you want to use
```

Configure the models to run against in `bench/src/config/models.config.ts`
(also sets the default judge model).

## Usage

Run from the repo root:

```
bun bench/src/cli.ts list
bun bench/src/cli.ts run all --dry-run
bun bench/src/cli.ts run debugging/javascript-debounce --models anthropic:sonnet,openai:gpt-4o-mini
bun bench/src/cli.ts report
```

Or via the package script alias: `bun run bench <subcommand> ...`.

### `run <prompt-glob-or-all>`

- `--models id1,id2` — restrict to specific model matrix ids (default: all configured).
- `--judge <id>` — override the judge model for this run (default: `judgeModel` in config, or `BENCH_JUDGE_MODEL_ID`).
- `--concurrency <n>` — default per-provider concurrency (individual matrix entries can set their own `maxConcurrent`, e.g. for single-GPU local servers).
- `--dry-run` — resolve and print the prompt x model matrix with zero network calls.
- `--no-judge` — skip LLM-judge scoring.

Provider calls time out after 120 seconds by default. Matrix entries can override this
with `timeoutMs`. A completed batch exits nonzero if any candidate or judge request
failed, while still storing successful and failed results for reporting.

### `report`

- `--out <path>` — write to a specific path (default: `bench/reports/<timestamp>.html`, always also mirrored to `bench/reports/latest.html`).
- `--batch <run_batch_id>` — restrict the report to one `run` invocation.
- `--all-runs` — show full run history per (prompt, model) instead of just the latest.

## Storage

Results are stored in `bench/data/bench.sqlite` (`runs` and `scores` tables, gitignored).

## Phase 2 (not yet implemented)

`bench/src/providers/harness.ts` sketches an `AgentHarness` interface for running
prompts through real tool-using coding agents (Claude Code, Codex CLI, Opencode, OMP)
instead of a plain single-turn API call. The runner/db/judge/report layers depend on
the narrow `CandidateRunner` interface (`bench/src/runner/candidateRunner.ts`) rather
than directly on model adapters, so adding harness support later shouldn't require
changes to those layers.
