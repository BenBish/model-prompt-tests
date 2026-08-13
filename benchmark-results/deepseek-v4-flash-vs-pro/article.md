# DeepSeek V4 Flash vs Pro on Practical Prompt Tests

On this benchmark run, DeepSeek V4 Pro narrowly outscored DeepSeek V4 Flash across the same 13 repository-local prompts: `4.50` average peer-judge score for Pro versus `4.38` for Flash. The quality gap is small. The cost gap is not: Pro cost `$0.2148` for candidate answers versus `$0.0100` for Flash — about **21×** more for a **+0.12** score delta.

This is a same-lineage comparison, not a cross-vendor ranking. Both models reached GA recently (Flash 0731 on 2026-07-31, Pro 0813 on 2026-08-12), share a 1M-token context window, and ran through the same OpenRouter path with the same judges. The run also dogfoods the council features shipped this cycle: anonymized peer ranking as a **secondary** signal ([BSH-153](https://linear.app/bshp/issue/BSH-153) / [BSH-151](https://linear.app/bshp/issue/BSH-151)) and chairman synthesis on a four-prompt subset ([BSH-150](https://linear.app/bshp/issue/BSH-150)). Peer ranks do **not** replace rubric `avgScore` headlines.

## Methodology

The benchmark used the 13 prompt tests in this repository and the local harness under `bench/`. Each prompt includes the user-facing task plus an evaluation rubric. Both candidates ran through OpenRouter:

- `openrouter:deepseek-v4-flash` mapped to `deepseek/deepseek-v4-flash-0731` (284B total / 13B active)
- `openrouter:deepseek-v4-pro` mapped to `deepseek/deepseek-v4-pro-0813` (1.6T total / 49B active)

Scoring used two **peer** judges that are not in the candidate set: GPT-5.5 (`judge:openrouter-gpt-5.5`) and Claude Sonnet 5 (`openrouter:sonnet`). Headline `avgScore` is the mean of per-prompt medians across those peer judges. Self-judging does not apply here.

After candidates and judges, `--peer-rank` ran anonymized Stage 2 ranking: each successful candidate ranked both answers with brand labels hidden. Those ranks are reported below as a side signal only. A follow-on `synthesize --prompts` pass then asked GPT-5.5 to write one combined answer for four high-signal prompts. Synthesis is answer production; it never writes `scores`.

The batch id is `2026-08-13T21-13-26-015Z-85hr0k`. Candidate `maxTokens` is `32768`: a first attempt at the default `4096` spent the entire budget on hidden reasoning and returned empty `message.content` (`finish_reason=length`). DeepSeek V4 Pro also rejects `response_format: json_schema`, so peer-rank calls fall back to a plain-JSON contract.

Supporting artifacts:

- [Run config](./run-config.md)
- [Aggregate summary JSON](./summary.json)
- [Per-prompt results](./per-prompt-results.md)
- [Raw outputs and score rationales](./raw-outputs-and-scores.json)
- [Interactive report](./report.html)

## Headline Results

| Model | Completed runs | Avg score | Avg latency ms | Median latency ms | Avg output tokens | Avg judge spread | Total cost | Quality/$ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `openrouter:deepseek-v4-pro` | 13 | 4.50 | 2925 | 2706 | 4954 | 0.38 | $0.2148 | 272.3 |
| `openrouter:deepseek-v4-flash` | 13 | 4.38 | 2828 | 2381 | 3505 | 0.31 | $0.0100 | 5694.6 |

All 26 candidate responses completed. All 52 judge rows returned valid scores. Judge agreement was 69% on both models (exact integer match across the two peer judges). Latency is effectively tied on this harness path; Pro is just slightly slower and substantially more verbose.

## Where they tied

Both models received perfect `5.00` peer averages on:

- `architecture/database-choice`
- `code-review/senior-pr-review`
- `debugging/javascript-debounce`
- `safety-risk/failed-production-migration`

That is the useful same-lineage result. On core engineering judgment — schema choice, PR review, a concrete bug fix, and a failed production migration — Flash and Pro were indistinguishable to the judges. If those are your tasks, Flash is the default.

## Where Pro earned the headline

Pro’s `+0.12` average comes from five prompts, not a sweep:

| Prompt | Flash | Pro |
| --- | ---: | ---: |
| `writing/internal-announcement` | 4.00 | 5.00 |
| `travel/san-francisco-city-break` | 4.50 | 5.00 |
| `creativity-with-constraints/budgeting-app-names` | 4.50 | 5.00 |
| `instruction-following/five-bullet-summary` | 3.50 | 4.00 |
| `planning/six-hour-sql-plan` | 3.50 | 4.00 |

Pro was stronger on writing, travel personalization, constrained naming, format-heavy summarization, and teaching-plan realism. The five-bullet prompt was also the only cell where judges disagreed by 2 points (GPT-5.5 scored Pro `3`, Sonnet scored Pro `5`).

## Where Flash held or won

Flash beat Pro on three technical/analysis prompts:

| Prompt | Flash | Pro |
| --- | ---: | ---: |
| `coding-build/pomodoro-timer` | 5.00 | 4.50 |
| `data-analysis/business-metrics-diagnosis` | 5.00 | 4.50 |
| `meta-evaluation/evaluation-rubric` | 5.00 | 4.50 |

Judges credited Flash for a complete runnable Pomodoro, for centering the churn + support-ticket signal in the business diagnosis, and for slightly cleaner scoring anchors on the rubric-design task. Flash also matched Pro’s perfect scores on the four engineering ties above.

## Failure modes

Both models scored `2.00` on `ambiguous-requests/team-notes-app`. The rubric rewards clarifying questions, explicit assumptions, and a scoped MVP. Both jumped into large full-stack implementations. Dimension scores tell the same story: `clarifying-behavior` was `1.0` for both; `scope-control` was `1.5` / `2.0`. More architecture was not better.

Both also lost ground on `planning/six-hour-sql-plan` (Flash `3.50`, Pro `4.00`) because `time-realism` and `scope-discipline` were weak — the lesson plans overstuffed a six-hour window.

No candidate run truncated after the `maxTokens` increase. The earlier empty-content failures were reasoning-budget artifacts, not model refusals.

## Peer ranks as a side signal

Following the [BSH-151 calibration recommendation](../../docs/peer-rank-calibration.md), anonymized peer ranks are a **secondary view only**. They do not change `avgScore`, badges, or the headline table.

Overall Borda after 26 successful ranking calls was a dead heat:

| Model | Borda | Avg rank | Times ranked |
| --- | ---: | ---: | ---: |
| Flash | 39 | 1.50 | 26 |
| Pro | 39 | 1.50 | 26 |

In a two-model cell, each ranker usually put itself first. That is expected and is exactly why ranks cannot be the regression headline: they are relative to this roster, and here the roster is the two models being compared.

The interesting cells are where **both** rankers agreed:

- Both preferred Flash on `data-analysis/business-metrics-diagnosis` (matches the rubric: Flash `5.00` vs Pro `4.50`)
- Both preferred Flash on `debugging/javascript-debounce` (rubric tie at `5.00`)
- Both preferred Pro on `planning/six-hour-sql-plan` (matches the rubric: Pro `4.00` vs Flash `3.50`)
- Both preferred Pro on `writing/internal-announcement` (matches the rubric: Pro `5.00` vs Flash `4.00`)
- On `safety-risk/failed-production-migration` they swapped: each ranked the other first (rubric tie at `5.00`)

When ranks and rubric medians agree, quote that as supporting color. When they split or when each model votes for itself, ignore the Borda number. Do not blend it into `avgScore`.

## Chairman synthesis (illustrative subset)

GPT-5.5 synthesized one combined answer for four prompts (`team-notes-app`, `senior-pr-review`, `business-metrics-diagnosis`, `failed-production-migration`). Cost of those four chairman calls: `$0.2278` — more than both candidates combined. That is the point of keeping Stage 3 optional.

The synthesized reviews and diagnoses are usable artifacts: the PR review leads with fractional-cents and coupon validation; the business note leads with accelerating churn masked by revenue; the migration note says do not drop the table. The team-notes synthesis still overbuilds, because both source answers overbuilt. Synthesis cannot invent clarifying questions the candidates never asked.

## Practical takeaways

- **Default to Flash** for this prompt set unless you specifically want Pro’s extra writing, travel, and format-precision edge. The quality delta is a tenth of a point; the cost delta is more than an order of magnitude.
- **Do not pay Pro prices for the engineering ties.** Database choice, PR review, debounce, and migration safety were perfect for both.
- **Watch ambiguous product-build prompts.** Neither model clarified; both shipped a blueprint. Force a clarifying turn in the system prompt if that is the behavior you want.
- **Use peer ranks as a disagreement detector**, not a winner. A 2-model self-ranking matrix will tie on Borda even when rubric scores do not.
- **Use chairman synthesis when you want one answer to publish**, not when you want to score models. It is an extra large-context call and it inherits the candidates’ failure modes.

## Limitations

This is one batch, 13 prompts, one provider path, and two LLM judges. Latency and cost are harness measurements for this OpenRouter run, not universal speed or price claims. OpenRouter billed cost is used when present.

Peer ranking required a plain-JSON fallback for Pro (`json_schema` is unavailable on that snapshot). Flash ranking originally failed on Pomodoro because reasoning ate the token budget; the replay with the same `32768` cap succeeded. Those harness details are part of the result.

Chairman synthesis ran on a four-prompt subset only. It is not a third judge.

## Next steps

Useful follow-ups:

- Repeats (`--repeats 3`) to see whether the `+0.12` gap is stable.
- A third, non-DeepSeek ranker so peer ranks are not a two-vote self-preference.
- Human labels on the five-bullet cell (judge spread 2) and the team-notes cell (both scored 2).
- A coding task that produces files rather than one giant HTML response.

For now the measured conclusion is narrow: on this 2026-08-13 run, DeepSeek V4 Pro is slightly better and much more expensive than DeepSeek V4 Flash on this lab’s practical prompt suite. Flash is the value default; Pro is the writing/precision upgrade.
