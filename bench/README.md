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
  --max-concurrent 1 \
  --input-per-mtok 0.5 \
  --output-per-mtok 1.5
```

Optional `--input-per-mtok` / `--output-per-mtok` (both required together) store
per-model pricing used to estimate `cost_usd` when the provider does not report a
billed cost. OpenRouter (and similar) billed costs on `usage.cost` take precedence.

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
- `--compare <batchA> --compare <batchB>` — write a batch-vs-batch comparison HTML (score/cost/latency deltas) instead of the normal report.

Every normal `report` invocation writes three files (plus `latest.*` mirrors):
`<timestamp>.html` (interactive report with charts, sortable summary, theme toggle),
`<timestamp>.summary.json` (per-model `ModelSummary` stats), and
`<timestamp>.assessment.md` (deterministic markdown writeup).

### `export` / `publish`

Package a batch into a shareable directory, then assemble exported runs into a static
site under `docs/` (GitHub Pages). Both `--name` and either `--batch` or `--latest` are
required for export:

```
bun run bench export --name grok-45-vs-sonnet-5 --latest
bun run bench export --name my-run --batch <run_batch_id>
bun run bench publish
```

Export names must be lowercase kebab-case (`^[a-z0-9][a-z0-9-]*$`). Export writes to
`benchmark-results/<name>/` (gitignored except intentionally committed writeups such as
`grok-45-vs-sonnet-5`); only commit an export directory when you mean to keep it in the
repo. `docs/` is excluded from prompt discovery so published pages cannot break `run all`.

## Aggregation

**Note:** headline scores are **peer-only**. Re-running reports against older batches
where a candidate was also a judge will lower that model's headline `avgScore` versus
pre-Phase-2.5 reports (self scores still appear as `selfScoreAvg`).

By default `report` shows only the most recent `run` batch for each (prompt, model)
cell, but keeps every repeat within that batch (`--all-runs` shows full history instead).
A single run's judge scores collapse to one number via the **median across peer judges**
(not the mean), so one outlier judge doesn't skew a run's score. **Self-judging is
excluded from headline scores** (`avgScore`, badges, charts, agreement, dimension
averages):

- **Prompt runs:** judge model id equals the candidate model id.
- **SWE runs:** judge id equals the cell `harness:alias`, the bare model alias, or ends
  with `:<alias>` (so a bench judge like `anthropic:haiku` scoring `claude-code:haiku`
  is treated as self).

When `--repeats > 1`, a cell's repeats collapse the same way: **median across repeats**.
A model's `avgScore` is the mean of its per-cell medians. `scoreStdDev` is computed
across all individual peer run scores; `repeatVariance` is the mean of per-cell score
stddevs (only meaningful once `--repeats > 1`); `judgeAgreementPct` is the share of
multi-peer-judge runs where every peer judge gave the exact same integer score. Cost
columns use provider-reported USD when present, otherwise pricing × tokens;
`truncatedRuns` counts stop reasons `length` / `max_tokens` / `max_output_tokens`.

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

Results are stored in `bench/data/bench.sqlite` (`runs`, `scores`, and `swe_results`
tables, gitignored). Schema migrations for new columns are applied automatically on
open (`bench/src/db/client.ts`), so existing databases upgrade in place.

## SWE benchmarking

Real-world software-engineering tasks — fix a bug, implement a feature — run through
an agent harness (Claude Code, a raw single-shot API call, and more in the future),
verified by a hidden test suite the agent never sees, plus an LLM judge for code
quality and process. This is a separate pipeline from `run`/`report` above: its own
task format, its own harness config, and its own `swe` subcommand.

### Setup

```
bun run bench models init      # if not already done — raw-api reuses bench/models.json
cp bench/harnesses.example.json bench/harnesses.json   # gitignored, edit as needed
```

### Task format (`swe-tasks/`)

```
swe-tasks/
  fixture/<name>/
    task.md       # frontmatter + task description
    project/      # the visible starting project, copied into a fresh git workspace
    hidden/       # test overlay applied ONLY after the agent finishes
  external/<name>/
    task.md       # repoUrl + commitSha (+ optional holdoutPatch, testPaths)
    source.bundle # optional offline seed (git bundle); or any cloneable URL/path
  code-review/<name>/
    task.md       # type: code-review
    diff.patch    # unified diff under review
    findings.json # ground-truth findings + optional redHerrings
```

`task.md` frontmatter is flat `key: value` (plus indented `- item` lists for
array-typed keys: `tags`, `ignorePaths`, `envPassthrough`, `testPaths`, `contextFiles`):

````markdown
---
type: fixture
verify: bun test
verifyTimeoutMs: 30000
agentTimeoutMs: 300000
tags: typescript, debugging
---
# Fix the debounce utility

## Task

```text
The debounce function in src/debounce.ts sometimes calls fn more than once. Fix it.
```

## Judging Guidance

- Reward identifying that a prior scheduled call is never cancelled.

## Scoring Dimensions

- `correctness` (weight 3): Only the most recent call's arguments trigger fn, and only once.
- `code-quality` (weight 2): Minimal fix that preserves the calling contract.
````

`## Scoring Dimensions` uses the same optional, weighted format as prompt files (see
above). See `swe-tasks/fixture/{smoke,debounce-fix,cart-discount}/` for worked examples,
including how `hidden/` catches an agent that only special-cases the visible test.

#### External tasks

External tasks pin a real git repo (HTTPS URL, local path, or relative path/bundle under
the task directory) at `commitSha`. Provisioning:

1. Blob-less clone cached at `bench/data/repo-cache/<hash>/` (reused across runs — second
   run is offline for the same URL).
2. Per cell: `git worktree add <workspace> <commitSha>`.
3. After the agent finishes: reset `testPaths` with `git checkout <sha> -- <paths>`, then
   apply optional `holdoutPatch` (SWE-bench style hidden tests the agent never saw).
4. Run `verify` as usual.

Only listed `testPaths` are defended against agent tampering — authors are responsible
for listing every grader path. Seed example: `swe-tasks/external/tiny-add/` (offline
`source.bundle` + `holdout.patch`).

#### Code-review tasks

Diff-only reviews (no hidden-test verify). Workspace is minimal: `DIFF.patch` + README
instructions; the harness prompt embeds the unified diff. Agent output is the review text
(`mode: review` — raw-api returns text without applying a patch).

Ground truth lives in `findings.json`:

```json
{
  "findings": [
    {
      "id": "fractional-cents",
      "severity": "high",
      "summary": "Coupon math can produce fractional cents.",
      "matchHints": ["fractional", "cents", "rounding"]
    }
  ],
  "redHerrings": [{ "summary": "Rename for style only" }]
}
```

After the agent runs, the **primary `--judge` model** also acts as matcher: one structured
call maps the review onto findings. Severity-weighted **recall** (high=3, med=2, low=1),
unweighted claim-count **precision** (TP / (TP + plausible extras)), and **F1** land in
`swe_results.review_metrics` and the SWE report columns. Qualitative SWE judging still runs
for process/quality dimensions.

When a judge is configured, a successful matcher pass is **required**: matcher failure marks
the run as `error` (agent output is still stored). Runs without `--judge` skip matching and
record no recall/precision/F1. Console pass/fail counts stay 0 for pure code-review batches
(there is no verify step) — look at per-cell F1 / the report instead.

Seeds: `swe-tasks/code-review/{cart-coupon,auth-timing}/`.

### Harness config (`bench/harnesses.json`)

Each entry maps CLI-facing model aliases to harness-native model names:

```json
{
  "harnesses": [
    { "id": "claude-code", "kind": "claude-code",
      "models": { "sonnet": "claude-sonnet-5", "haiku": "claude-haiku-4-5-20251001" },
      "maxTurns": 60 },
    { "id": "codex", "kind": "codex",
      "models": { "o4-mini": "o4-mini" }, "sandbox": "workspace-write" },
    { "id": "grok", "kind": "generic-cli", "binary": "grok",
      "command": ["grok", "--output-format", "json",
        "--permission-mode", "bypassPermissions", "--always-approve",
        "--cwd", "{workdir}", "-m", "{model}",
        "--prompt-file", "{promptFile}", "--max-turns", "60"],
      "promptVia": "file", "resultPath": "text",
      "models": { "default": "grok-4" } },
    { "id": "raw-api", "kind": "raw-api", "maxContextBytes": 120000 }
  ]
}
```

Model alias → native name maps in `harnesses.example.json` are **placeholders**. Copy to
`bench/harnesses.json` and edit for the models installed on your machine, then validate with
`bun run bench swe doctor` (non-empty parsed `finalMessage` is required to pass).

`bun test` ignores `bench/data/workspaces/**` and `bench/data/repo-cache/**` (see `bunfig.toml`)
so `--keep-workspaces` trees cannot pollute the unit suite with agent-written `*.test.ts` files.

- **`claude-code`** runs `claude -p --output-format json --dangerously-skip-permissions`
  headlessly, prompt on stdin, in an isolated workspace directory. It does **not** pass
  `--bare` by default — `--bare` skips normal OAuth/subscription session-credential
  discovery and requires `ANTHROPIC_API_KEY` explicitly (confirmed empirically). Set
  `"bare": true` on the entry for hermetic runs once `ANTHROPIC_API_KEY` is available.
- **`codex`** runs `codex exec --cd <workDir> --ephemeral --skip-git-repo-check -m <model>
  --json -o <file outside workdir> -s workspace-write` (default sandbox). Set
  `"dangerouslyBypassApprovalsAndSandbox": true` only in externally sandboxed environments.
  Optional `"oss": true` / `"localProvider": "ollama"` for local models. For OpenAI-compatible
  local servers (e.g. llama-swap), use `"ignoreUserConfig": true` plus
  `"configOverrides": { "model_providers.llamaswap.base_url": "https://host/v1",
  "model_providers.llamaswap.wire_api": "responses", "model_provider": "llamaswap" }`
  (and a matching models map).
- **`generic-cli`** is a config-driven adapter for tools like **Grok** and **omp**: a
  `command` argv template with `{model}` / `{workdir}` / `{promptFile}` placeholders,
  `promptVia: stdin|arg|file`, and optional `resultPath` into the JSON/JSONL output
  (whole stdout is the fallback). Grok's example uses `--prompt-file` + `resultPath: "text"`
  (current Grok JSON shape) rather than single-turn `-p` alone — re-check with `swe doctor`
  after CLI upgrades. `omp` ships disabled in `harnesses.example.json`.
- **`raw-api`** has no agent loop and no `models` map: model aliases are bench model ids
  from `bench/models.json` directly (e.g. `anthropic:sonnet`). It bundles the
  workspace's own files as context, asks the model for a single fenced unified diff, and
  applies it with `git apply` (one corrective retry if the reply has no diff fence). A
  diff that fails to apply is recorded honestly — real models sometimes emit malformed
  hunk headers — and verification simply fails, rather than being treated as a tool error.

All harness kinds spawn CLIs with a whitelisted environment (`PATH`/`HOME`/`TMPDIR`/
`LANG`/`LC_ALL` plus anything explicitly needed) and strip `CLAUDE_CODE_*`/`CLAUDECODE`
env vars, since bench itself may be invoked from inside a Claude Code session.

### `swe list`

Prints discovered tasks and an availability check (`Bun.which` — cheap, no process
spawned) for every configured harness.

### `swe doctor`

Probes every enabled harness (or `--harnesses id1,id2`) with a trivial echo prompt in a
temp directory, then prints the parsed `finalMessage`. Use this after upgrading CLIs
(Claude Code / Codex / Grok) to catch JSON-format drift before spending agent budget:

```
bun run bench swe doctor
bun run bench swe doctor --harnesses codex,grok --timeout 30000
```

Exit code is nonzero if any harness is unavailable or the probe run fails/times out.

### `swe run <task-glob-or-all>`

- `--harnesses <ids>` — **required**, comma-separated harness ids from `harnesses.json`.
- `--models <aliases>` — **required**, comma-separated model aliases. Every
  harness/alias combination must resolve (raw-api against `bench/models.json`, other
  harnesses against their own `models` map) — an unresolved combination errors before
  anything runs.
- `--repeats <n>`, `--concurrency <n>` (per-harness limiter, default 2), `--judge`/`--judges`/`--no-judge`, `--dry-run`, `--timeout <ms>` (overrides every selected task's `agentTimeoutMs`), `--keep-workspaces` (workspaces under `bench/data/workspaces/`, gitignored, are always kept on error and cleaned up on success unless this flag is set).

`--models` and `--harnesses` are both required deliberately: agent runs are the
expensive part of this benchmark, so there is no "run everything" default. `--dry-run`
runs the availability checks and prints a worst-case wall-clock estimate (every cell
hitting its timeout) before any process is spawned or network call made.

Each cell: copy the task's `project/` into a fresh git workspace → commit a baseline →
run `setup` if any → commit again (that second commit is the diff baseline) → run the
harness → capture the agent's diff against that baseline → overlay `hidden/` (this
overwrites any file the agent tampered with) → run `verify` with a timeout → judge.
A `verify` pass/fail is the primary, objective signal; the judge scores are secondary
(code quality, diff minimality, whether the agent's own summary was honest).

`report` (above) picks up SWE runs automatically and adds an "SWE Task Summary"/"SWE
Task Details" section to the HTML report and assessment — pass rate, judge score,
agent latency, diff size, and timeouts per harness:model, plus a task × harness:model
matrix with collapsible diffs and verify output. Prompt runs and SWE runs are stored in
the same `runs` table (`kind` column) but never mixed in either report's summary table.
