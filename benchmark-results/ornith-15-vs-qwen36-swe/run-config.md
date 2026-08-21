# Ornith 1.5 vs Qwen3.6 SWE run config (BSH-207)

- Issue: [BSH-207](https://linear.app/bshp/issue/BSH-207/bench-ornith-15-vs-qwen36-on-swe-benchmark-partial-credit-scoring)
- Date: 2026-08-20 / 2026-08-21 UTC
- Repo: worktree `/home/ben/Dev/model-prompt-tests-bsh-207` at `051d523` (partial-credit scoring + Pomodoro contract fix)
- Harness: `codex-lab` (`kind: codex`, `maxConcurrency: 1`, `metricsUrl: http://127.0.0.1:18080`)
- Codex CLI: `0.148.0` from `/home/ben/.npm-global/bin` (not the mise/npx latest shim)
- Engine: Halo `/home/ben/AI/llama-lab/b1311/llama-server`, exclusive GPU via `scripts/run-halo-candidate-suite.sh`
- Context: 131072, `-ctk q8_0 -ctv q8_0`, `-np 1`, `--jinja`, `--metrics`
- Reasoning: **off** on both arms
- Task selector: `fixture/*` × 3 repeats (12 cells/arm after a 1-cell smoke gate)
- Agent timeout override: `HALO_TIMEOUT_MS=600000` so Pomodoro is not clipped to 300s
- Judge: `--no-judge` (verify + partial-credit test counts only)

## Arms

| Alias | Weights | Sampling | Reasoning |
| --- | --- | --- | --- |
| `qwen36-35b-rerun` | `Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf` | `--temp 0.6 --top-p 0.95 --min-p 0.0 --presence-penalty 0.0` | `--reasoning off` |
| `ornith-15-q4-noreasoning` | `Ornith-1.5-35B-Q4_K_M.gguf` | `--temp 0.6 --top-p 0.95 --top-k 20` | `--reasoning off` |

Both aliases map to Codex model name `LAB-CANDIDATE`. Only one set of weights is loaded at a time.

## Batches (worktree `bench/data/bench.sqlite`)

| Arm | Smoke gate | 12-cell comparison |
| --- | --- | --- |
| Qwen3.6 | `2026-08-21T05-05-46-921Z-01bagq` (pass) | `2026-08-21T05-06-21-916Z-gm09uz` |
| Ornith Q4 thinking off | `2026-08-21T05-26-49-570Z-ftpfo3` (pass) | `2026-08-21T05-27-06-012Z-797uxn` |

Reproduce:

```bash
export PATH="/home/ben/.npm-global/bin:$PATH"
export MODEL_PROMPT_TESTS_REPO=/path/to/this/repo
export HALO_TASK_GLOB='fixture/*'
export HALO_REPEATS=3
export HALO_TIMEOUT_MS=600000
/home/ben/Dev/benbishop-context/scripts/run-halo-candidate-suite.sh qwen36-35b-rerun
/home/ben/Dev/benbishop-context/scripts/run-halo-candidate-suite.sh ornith-15-q4-noreasoning
```

`report.html` / `assessment.md` were generated with `bun bench/src/cli.ts report --all-runs` from the worktree DB (includes the two smoke-gate cells). Headline numbers in `article.md` and `summary.json` use the 12-cell comparison batches only. Decode/prompt tok/s in `summary.json` are token-weighted (`sum(tokens)/sum(seconds)`), matching `sweReportData.ts`, not an unweighted mean of per-cell rates.
