# Bench Assessment

These rows are `bun bench/src/cli.ts report --all-runs` on the worktree DB: **13 cells/arm**, including the smoke-gate cell. Headline numbers in `article.md` and `summary.json` use the **12-cell comparison batches only**.

Report: `benchmark-results/ornith-15-vs-qwen36-swe/report.html`
Summary JSON: `benchmark-results/ornith-15-vs-qwen36-swe/summary.json`
Generated: `2026-08-21T06:09:27.295Z`

## SWE Task Summary

| Harness:Model | Total | OK | Errors | Verify passed | Verify failed | Verify rate | Clean passed | Verified after timeout | Clean pass rate | Avg test pass % | Avg judge | Median judge | Avg recall | Avg precision | Avg F1 | Avg agent ms | Decode tok/s | Prompt tok/s | Avg diff lines | Timeouts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `codex-lab:ornith-15-q4-noreasoning` | 13 | 13 | 0 | 9 | 4 | 69% | 9 | 0 | 69% | 81% | — | — | — | — | — | 185427 | 46.2 | 474.7 | 86.8 | 2 |
| `codex-lab:qwen36-35b-rerun` | 13 | 13 | 0 | 10 | 3 | 77% | 10 | 0 | 77% | 94% | — | — | — | — | — | 80956 | 43.5 | 692.7 | 67.8 | 0 |

### Metric notes

- **Verify rate** is binary: the fraction of runs where the whole verify command exited 0.
- **Avg test pass %** is partial credit: the mean fraction of individual hidden/visible tests passed per run, parsed from `bun test`'s summary. It stays informative even when every run in a cell fails Verify rate outright, and reads as `—` for any verify command other than `bun test`.
- **Avg/median judge** measures process and code quality on top of a verify result that's already known — it does not re-derive correctness, so don't read a high judge score as evidence a failing run actually worked.
