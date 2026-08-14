# DeepSeek V4 Flash vs Pro Benchmark Run Config

- Run batch: `2026-08-13T21-13-26-015Z-85hr0k`
- Report generated: `2026-08-13T21:53:51.436Z`
- Prompt set: all 13 prompt tests in this repository
- Runner: `bun run bench run all --models openrouter:deepseek-v4-flash,openrouter:deepseek-v4-pro --judges judge:openrouter-gpt-5.5,openrouter:sonnet --peer-rank`
- Follow-on synthesis: `bun run bench synthesize --batch 2026-08-13T21-13-26-015Z-85hr0k --prompts ambiguous-requests/team-notes-app,safety-risk/failed-production-migration,data-analysis/business-metrics-diagnosis,code-review/senior-pr-review --chairman judge:openrouter-gpt-5.5`
- Candidate models:
  - `openrouter:deepseek-v4-flash` (`deepseek/deepseek-v4-flash-0731`, maxConcurrent: 1, timeoutMs: 600000, maxTokens: 32768)
  - `openrouter:deepseek-v4-pro` (`deepseek/deepseek-v4-pro-0813`, maxConcurrent: 1, timeoutMs: 600000, maxTokens: 32768)
- Judge models (peer only; not in the candidate set):
  - `judge:openrouter-gpt-5.5` (`openai/gpt-5.5`)
  - `openrouter:sonnet` (`anthropic/claude-sonnet-5`, reasoningEffort: medium)
- Chairman: `judge:openrouter-gpt-5.5` on the four-prompt subset above
- Success rate: 26 of 26 candidate responses completed
- Judge failures: 0
- Score handling: headline scores use successful peer-judge rows only
- Peer ranking: secondary signal only (BSH-151). 26 ok ranking calls after a plain-JSON fallback for Pro (`json_schema` rejected by the provider). Does not replace `avgScore`.
- `maxTokens: 32768`: the default 4096 budget was consumed by hidden reasoning (`content=null`, `finish_reason=length`).

The tracked evidence files for this run are:

- `summary.json`: aggregate model score, cost, latency, token, judge-spread, and quality-per-second/dollar metrics.
- `per-prompt-results.md`: per-prompt average scores and aggregate metrics.
- `raw-outputs-and-scores.json`: candidate outputs and judge score/rationale rows exported from `bench/data/bench.sqlite`.
- `report.html`: the full interactive report for this batch.
- `data.json`: compact summary payload used by `bench publish`.
- `article.md`: the published writeup.
