# Openrouter Free Models Run Config

- Run batch: `2026-08-29T01-29-50-390Z-ntpzht`
- Report generated: `2026-08-29T04:07:28.789Z`
- Prompt set: 19 prompt(s) (see `per-prompt-results.md` for the list)
- Runner: `bun run bench run all`
- Candidate models:
  - `openrouter:dots3-note-preview-free` (openrouter, dots-studio/dots-3-note-preview:free, maxConcurrent: 1)
  - `openrouter:gemma-4-31b-free` (openrouter, google/gemma-4-31b-it:free, maxConcurrent: 1)
  - `openrouter:gemma-4-free` (openrouter, google/gemma-4-26b-a4b-it:free, maxConcurrent: 1)
  - `openrouter:glm-5.2-free` (openrouter, z-ai/glm-5.2:free, maxConcurrent: 1)
  - `openrouter:inkling-free` (openrouter, thinkingmachines/inkling:free, maxConcurrent: 1)
  - `openrouter:inkling-small-free` (openrouter, thinkingmachines/inkling-small:free, maxConcurrent: 1)
  - `openrouter:laguna-s-free` (openrouter, poolside/laguna-s-2.1:free, maxConcurrent: 1)
  - `openrouter:laguna-xs-free` (openrouter, poolside/laguna-xs-2.1:free, maxConcurrent: 1)
  - `openrouter:lfm-2.5-free` (openrouter, liquid/lfm-2.5-2.6b:free, maxConcurrent: 1)
  - `openrouter:ling-3-flash-fin-free` (openrouter, inclusionai/ling-3.0-flash-fin:free, maxConcurrent: 1)
  - `openrouter:minimax-m2.7-free` (openrouter, minimax/minimax-m2.7:free, maxConcurrent: 1)
  - `openrouter:minimax-m3-free` (openrouter, minimax/minimax-m3:free, maxConcurrent: 1)
  - `openrouter:nemotron-3-nano-omni-free` (openrouter, nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free, maxConcurrent: 1)
  - `openrouter:nemotron-3-super-free` (openrouter, nvidia/nemotron-3-super-120b-a12b:free, maxConcurrent: 1)
  - `openrouter:nemotron-3-ultra-free` (openrouter, nvidia/nemotron-3-ultra-550b-a55b:free, maxConcurrent: 1)
  - `openrouter:nemotron-3.5-lightning-free` (openrouter, nvidia/nemotron-3.5-lightning:free, maxConcurrent: 1)
  - `openrouter:north-mini-code-free` (openrouter, cohere/north-mini-code:free, maxConcurrent: 1)
- Judge models:
  - `judge:openrouter-gpt-5.5`
  - `openrouter:sonnet`
- Success rate: 214 of 323 candidate responses completed
- Judge failures: 0 (see `per-prompt-results.md` for details)
- Score handling: headline scores use successful peer-judge rows only (self-judging is excluded and reported separately)

The tracked evidence files for this run are:

- `summary.json`: aggregate model score, cost, latency, token, judge-spread, and quality-per-second/dollar metrics.
- `per-prompt-results.md`: per-prompt average scores and aggregate metrics.
- `raw-outputs-and-scores.json`: candidate outputs and judge score/rationale rows exported from `bench/data/bench.sqlite`.
- `report.html`: the full interactive report for this batch.
- `data.json`: compact summary payload used by `bench publish`.
