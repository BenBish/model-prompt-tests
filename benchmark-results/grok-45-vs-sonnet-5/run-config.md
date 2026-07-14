# Grok 4.5 vs Sonnet 5 Benchmark Run Config

- Run batch: `2026-07-13T03-39-20-964Z-y7fo6o`
- Report generated: `2026-07-13T03-56-57-179Z`
- Prompt set: all 13 prompt tests in this repository
- Runner: `bun run bench run all`
- Candidate models:
  - `openrouter:grok-4.5` (`x-ai/grok-4.5`)
  - `openrouter:sonnet` (`anthropic/claude-sonnet-5`)
  - `openrouter:gpt-5.5` (`openai/gpt-5.5`)
- Judge models:
  - `openrouter:gpt-5.5`
  - `openrouter:grok-4.5`
  - `openrouter:sonnet`
- Shared fairness setting: `reasoningEffort: "medium"`
- Candidate concurrency: `maxConcurrent: 1` for each OpenRouter model
- Candidate timeout: `300000` ms for each OpenRouter model
- Success rate: 39 of 39 candidate responses completed
- Judge failures: 3 Sonnet judge calls failed to return valid JSON after two attempts
- Score handling: aggregate scores use successful judge rows only

The tracked evidence files for this run are:

- `summary.json`: aggregate model score, latency, token, judge-spread, and quality-per-second metrics.
- `per-prompt-results.md`: per-prompt average scores and output metrics.
- `raw-outputs-and-scores.json`: candidate outputs and judge score/rationale rows exported from `bench/data/bench.sqlite`.
