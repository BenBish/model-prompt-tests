# Flash Tier Shootout Run Config

- Run batch: `2026-09-12T05-38-13-691Z-hweqg8`
- Report generated: `2026-09-12T06:29:26.488Z`
- Prompt set: 19 prompt(s) (see `per-prompt-results.md` for the list)
- Runner: `bun run bench run all`
- Candidate models:
  - `openrouter:deepseek-v4.1-flash` (openrouter, deepseek/deepseek-v4.1-flash, maxConcurrent: 1, timeoutMs: 600000)
  - `openrouter:gemini-3.8-flash` (openrouter, google/gemini-3.8-flash, maxConcurrent: 1, timeoutMs: 600000)
  - `openrouter:glm-5.3-flash` (openrouter, z-ai/glm-5.3-flash, maxConcurrent: 1, timeoutMs: 600000)
  - `openrouter:qwen3.8-flash` (openrouter, qwen/qwen3.8-flash, maxConcurrent: 1, timeoutMs: 600000)
- Judge models:
  - `judge:openrouter-glm-5.2`
- Success rate: 74 of 76 candidate responses completed
- Judge failures: 0 (see `per-prompt-results.md` for details)
- Score handling: headline scores use successful peer-judge rows only (self-judging is excluded and reported separately)

The tracked evidence files for this run are:

- `summary.json`: aggregate model score, cost, latency, token, judge-spread, and quality-per-second/dollar metrics.
- `per-prompt-results.md`: per-prompt average scores and aggregate metrics.
- `raw-outputs-and-scores.json`: candidate outputs and judge score/rationale rows exported from `bench/data/bench.sqlite`.
- `report.html`: the full interactive report for this batch.
- `data.json`: compact summary payload used by `bench publish`.
