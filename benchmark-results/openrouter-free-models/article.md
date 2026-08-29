# OpenRouter Free Models on Practical Prompt Tests

I benched all 17 models in OpenRouter's free-models collection across 19 practical prompts. The best of them, `openrouter:nemotron-3-super-free`, averaged a 4.25 peer-judge score at 212 ms per answer, and every completed call cost $0.00. The headline caveat: only 214 of 323 candidate responses completed. Four models never answered a single prompt.

## Methodology

- 19 prompt tests from this repository's prompt library: 13 practical prompts (coding, writing, planning, judgment, safety, ambiguity) plus the 6 hermes agent prompts (calendar, tone, triage, multi-step errands, recall).
- Candidate models: the free-models collection roster on 2026-08-28: `openrouter:dots3-note-preview-free`, `openrouter:gemma-4-31b-free`, `openrouter:gemma-4-free`, `openrouter:glm-5.2-free`, `openrouter:inkling-free`, `openrouter:inkling-small-free`, `openrouter:laguna-s-free`, `openrouter:laguna-xs-free`, `openrouter:lfm-2.5-free`, `openrouter:ling-3-flash-fin-free`, `openrouter:minimax-m2.7-free`, `openrouter:minimax-m3-free`, `openrouter:nemotron-3-nano-omni-free`, `openrouter:nemotron-3-super-free`, `openrouter:nemotron-3-ultra-free`, `openrouter:nemotron-3.5-lightning-free`, `openrouter:north-mini-code-free`.
- Judge models: GPT-5.5 (`judge:openrouter-gpt-5.5`) and Claude Sonnet 5 (`openrouter:sonnet`). No candidate is a judge; headline scores are peer medians.
- Batch id: `2026-08-29T01-29-50-390Z-ntpzht`. Each candidate ran with `maxConcurrent: 1`. Judge failure rows: 0.
- Full config in `run-config.md`; raw outputs and judge rationales in `raw-outputs-and-scores.json`.

## Headline Results

| Model | Completed | Score (peer) | Avg latency ms | Total cost | Quality/sec |
| --- | ---: | ---: | ---: | ---: | ---: |
| `openrouter:nemotron-3-super-free` | 18/19 | 4.25 | 212 | $0.0000 | 20.05 |
| `openrouter:dots3-note-preview-free` | 17/19 | 4.21 | 579 | $0.0000 | 7.27 |
| `openrouter:nemotron-3-ultra-free` | 18/19 | 4.17 | 321 | $0.0000 | 13.00 |
| `openrouter:ling-3-flash-fin-free` | 19/19 | 4.16 | 544 | $0.0000 | 7.65 |
| `openrouter:minimax-m3-free` | 19/19 | 4.16 | 1,629 | $0.0000 | 2.55 |
| `openrouter:laguna-xs-free` | 13/19 | 4.15 | 193 | $0.0000 | 21.50 |
| `openrouter:minimax-m2.7-free` | 19/19 | 3.95 | 2,098 | $0.0000 | 1.88 |
| `openrouter:nemotron-3.5-lightning-free` | 19/19 | 3.92 | 197 | $0.0000 | 19.95 |
| `openrouter:nemotron-3-nano-omni-free` | 17/19 | 3.85 | 204 | $0.0000 | 18.87 |
| `openrouter:north-mini-code-free` | 19/19 | 3.76 | 515 | $0.0000 | 7.30 |
| `openrouter:laguna-s-free` | 18/19 | 3.69 | 916 | $0.0000 | 4.03 |
| `openrouter:glm-5.2-free` | 1/19 | 3.50 | 244 | $0.0000 | 14.34 |
| `openrouter:lfm-2.5-free` | 17/19 | 3.24 | 539 | $0.0000 | 6.00 |
| `openrouter:gemma-4-free` | 0/19 | no data | - | - | - |
| `openrouter:gemma-4-31b-free` | 0/19 | no data | - | - | - |
| `openrouter:inkling-free` | 0/19 | no data | - | - | - |
| `openrouter:inkling-small-free` | 0/19 | no data | - | - | - |

Quality/$ is undefined for every row: recorded usage was $0.00 across all 214 completed calls.

## Where each model looked strong

- `nemotron-3-super-free`: top score and near-top speed. The best all-round free result in the batch.
- `dots3-note-preview-free`: won 6 of 19 prompts outright (architecture, debugging, writing, two hermes prompts, constrained creativity), the most of any model, with 71% judge agreement.
- `minimax-m3-free` and `ling-3-flash-fin-free`: the high scorers that actually finished all 19 prompts. MiniMax had the batch's best judge agreement at 79%.
- `laguna-xs-free`: fastest clock in the batch (193 ms) and a 4.15 average, but only on 13 completed prompts.

## Failure modes

The availability failures outnumber the quality failures:

- Both `inkling` models: `403` on every call. Thinking Machines gates the free tier to agentic harnesses only; a chat-completions bench cannot run them.
- Both `gemma-4` tiers: `429` from the Google AI Studio shared pool on all 19 prompts each.
- `glm-5.2-free`: 18 of 19 failed, mostly upstream `429` via Decart.
- `laguna-xs-free`, `laguna-s-free`, `lfm-2.5-free`: intermittent `429` clusters mid-run.
- `dots3-note-preview-free`: two empty responses where a 4.4k-4.6k reasoning-token budget consumed the whole completion (`finish_reason: length`, no content).
- Shared weak spot: the ambiguous team-notes-app prompt capped at 2.50 for every model that ran it; nobody asked clarifying questions. The Pomodoro build split the field by runnability: 4.50 at the top, four models at 1.00.

## Practical takeaways

For interactive free usage, `nemotron-3-super-free`. For batch work that can retry throttles, `minimax-m3-free` or `ling-3-flash-fin-free`. Treat Inkling as untestable from a plain API harness and the Gemma 4 free tiers as unavailable until their pools stabilize. Context windows listed on the API (64k to 1M) describe the ceiling, not the realized output budget.

## Limitations

- This is one benchmark run, not a universal ranking. Latency and cost are harness-measured for this run only.
- Completed-run denominators differ, so partial rows average over different prompt subsets.
- The free-models collection changes over time; the roster is a 2026-08-28 snapshot.
- Self-judging is excluded from headline scores; see `summary.json` for the self-judged numbers.

## Next steps

Rerun the 13 models that scored at least once with `--repeats` for error bars. Re-queue the Gemma tiers off-peak to separate pool pressure from real exclusion.

## Links

- Article: https://bshp.io/articles/openrouter-free-models-benchmark/
- Issue: https://linear.app/bshp/issue/BSH-215/bench-openrouter-free-models-article
