# Bench

Automated benchmarking tooling for the prompts in this repo: runs each prompt against
multiple model providers, scores the outputs with one or more LLM judges against the
prompt's existing rubric, and generates an interactive HTML report with cost, latency,
and quality charts. `bench export` turns a run into a shareable results package, and
`bench publish` assembles every exported run into a static site you can host on GitHub
Pages.

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

Both `add-*` commands accept `--input-per-mtok <usd>` and `--output-per-mtok <usd>` to
record USD-per-million-token pricing (or edit `pricing: { inputPerMTok, outputPerMTok }`
directly in `bench/models.json`). Cost is then computed automatically from actual token
counts and shown throughout the report. OpenRouter models don't need pricing set —
`bench` asks OpenRouter to report the real billed cost per call and uses that instead.

### `run <prompt-glob-or-all>`

- `--models id1,id2` — restrict to specific model matrix ids (default: enabled configured models).
- `--judge <id>` — override the judge model for this run (default: `judge.modelId` in model config, or `BENCH_JUDGE_MODEL_ID`).
- `--judges id1,id2` — score every candidate with multiple judges instead of one (mutually exclusive with `--judge`). Scores from a judge that is also a candidate ("self-judging") are excluded from the headline average and reported separately.
- `--repeats <n>` — run each (prompt x model) `n` times to measure score variance (default 1). Every judge scores every attempt.
- `--concurrency <n>` — default per-provider concurrency (individual matrix entries can set their own `maxConcurrent`, e.g. for single-GPU local servers).
- `--dry-run` — resolve and print the prompt x model matrix with zero network calls.
- `--no-judge` — skip LLM-judge scoring.

Judges are asked for a structured JSON-schema response first (a forced tool call on
Anthropic, `response_format: json_schema` on OpenAI-compatible providers); if the
provider doesn't support that, judging falls back to the original plain-text JSON
contract with a corrective retry.

Provider calls time out after 120 seconds by default. Matrix entries can override this
with `timeoutMs`. A completed batch exits nonzero if any candidate or judge request
failed, while still storing successful and failed results for reporting.

### `report`

- `--out <path>` — write to a specific path (default: `bench/reports/<timestamp>.html`, always also mirrored to `bench/reports/latest.html`).
- `--batch <run_batch_id>` — restrict the report to one `run` invocation.
- `--all-runs` — show full run history per (prompt, model) instead of just the latest batch.
- `--compare <batchA> --compare <batchB>` — render a standalone batch-vs-batch delta page (score/cost/latency change per model) instead of the normal report.

The report is a single self-contained HTML file: a quality-vs-cost frontier, a
quality-vs-latency chart, a score-distribution chart, a cost-per-model chart, a
prompt x model score heatmap, a sortable summary table, and the full per-run detail
matrix. Click a model chip to isolate it everywhere on the page; the theme toggle
switches between auto/light/dark.

### `export`

```
bun run bench export --name grok-45-vs-sonnet-5 --batch <run_batch_id>
bun run bench export --name my-latest-run --latest   # most recent batch in the DB
```

Writes a complete, shareable results package to `benchmark-results/<name>/`:

- `summary.json` — aggregate per-model metrics.
- `raw-outputs-and-scores.json` — every candidate output and judge score/rationale.
- `per-prompt-results.md`, `run-config.md` — human-readable tables and run metadata.
- `report.html` — the full interactive report, scoped to this batch.
- `data.json` — compact payload consumed by `bench publish`.
- `article.md`, `x-thread.md` — writeup skeletons with headline numbers pre-filled and `_TODO_` markers for the narrative parts.

### `publish`

```
bun run bench publish
```

Scans `benchmark-results/*/data.json` (every batch that's been through `bench export`)
and assembles a static site into `docs/`: an index page listing every published run,
and `docs/runs/<name>/index.html` for each one (the exported `report.html`, with
Open Graph/Twitter meta tags injected). Re-running `publish` regenerates the whole
site from source, so it's safe to run repeatedly.

To publish workflow, end to end:

```
bun run bench run all
bun run bench export --name my-run --latest
bun run bench publish
git add benchmark-results/my-run docs
git commit -m "Add my-run benchmark"
git push
```

Then, one-time only, enable GitHub Pages for the repo: **Settings → Pages → Build and
deployment → Deploy from a branch → `main` / `/docs`**.

## Storage

Results are stored in `bench/data/bench.sqlite` (`runs` and `scores` tables, gitignored).
`runs` also tracks `cost_usd`, `stop_reason` (to flag truncated outputs), and `attempt`
(for `--repeats`). Opening the DB migrates an older schema in place automatically.

## Phase 2 (not yet implemented)

`bench/src/providers/harness.ts` sketches an `AgentHarness` interface for running
prompts through real tool-using coding agents (Claude Code, Codex CLI, Opencode, OMP)
instead of a plain single-turn API call. The runner/db/judge/report layers depend on
the narrow `CandidateRunner` interface (`bench/src/runner/candidateRunner.ts`) rather
than directly on model adapters, so adding harness support later shouldn't require
changes to those layers.
