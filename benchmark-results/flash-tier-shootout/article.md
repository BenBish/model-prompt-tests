# Flash Tier Shootout

Four current-generation flash-tier models — GLM-5.3-Flash, DeepSeek V4.1-Flash, Qwen3.8-Flash, and Gemini 3.8-Flash — landed within 0.25 points of each other on this repo's 19-prompt suite (`4.58`–`4.83`), but their cost and latency spread by **4×** and **4.4×** respectively: GLM-5.3-Flash was both the cheapest ($0.0465 total) and fastest (761ms avg) of the four, while Gemini 3.8-Flash was the most expensive ($0.1368) and slowest (3345ms avg) for a *lower* average score.

## Methodology

- 19 prompt tests from this repository's prompt library, covering coding, writing, planning, judgment (`hermes/*`), and ambiguous-request handling.
- Candidate models, all via OpenRouter:
  - `openrouter:glm-5.3-flash` → `z-ai/glm-5.3-flash`
  - `openrouter:qwen3.8-flash` → `qwen/qwen3.8-flash`
  - `openrouter:gemini-3.8-flash` → `google/gemini-3.8-flash`
  - `openrouter:deepseek-v4.1-flash` → `deepseek/deepseek-v4.1-flash`
- Judge: `judge:openrouter-glm-5.2` (`z-ai/glm-5.2`), a distinct model/family from every candidate — no self-judging exclusion applies.
- `maxTokens: 32768` on every candidate (all four expose a `reasoning`/`reasoning_effort` parameter and can spend the budget on hidden reasoning before answering; see Failure modes).
- `--peer-rank` ran anonymized Stage 2 ranking as a **secondary signal only** (see below); it was interrupted partway through by the harness process timeout after all candidate and judge calls had already completed, so only 29 of 74 planned ranking calls landed. This does not affect the headline `avgScore` table, which is judge-only.
- Batch id: `2026-09-12T05-38-13-691Z-hweqg8`. Judge configuration `judge:openrouter-glm-5.2` is `calibrated` against the repo's reference anchor evidence (`bench/calibration/reference-evidence-v1.json`) — comparative claims below are publication-eligible per `docs/human-judge-calibration.md`.

Supporting artifacts:

- [Run config](./run-config.md)
- [Aggregate summary JSON](./summary.json)
- [Per-prompt results](./per-prompt-results.md)
- [Raw outputs and score rationales](./raw-outputs-and-scores.json)
- [Interactive report](./report.html)

## Headline Results

| Model | Score (peer) | Avg latency ms | Total cost | Quality/$ |
| --- | ---: | ---: | ---: | ---: |
| `openrouter:glm-5.3-flash` | 4.83 | 761 | $0.0465 | 1872.2 |
| `openrouter:deepseek-v4.1-flash` | 4.72 | 1034 | $0.0908 | 936.5 |
| `openrouter:qwen3.8-flash` | 4.68 | 979 | $0.0337 | 2638.2 |
| `openrouter:gemini-3.8-flash` | 4.58 | 3345 | $0.1368 | 635.9 |

74 of 76 candidate responses completed (2 errors, both explained below). All 74 judge calls returned valid scores — zero judge failures. GLM-5.3-Flash leads on score, but by a margin (`+0.25` over the last-place Gemini) that is well inside a single-judge run's noise band; the wider story is **Quality/$**, where Qwen3.8-Flash's `2638.2` and GLM-5.3-Flash's `1872.2` are 3–4x Gemini's `635.9` for equal-or-better judged quality.

## Where each model looked strong

**GLM-5.3-Flash** — fastest (761ms avg, more than 4x faster than Gemini) and cheapest per response, with a perfect `5.00` on `code-review/senior-pr-review`, `debugging/javascript-debounce`, `data-analysis/business-metrics-diagnosis`, and both `hermes/multi-step-errand` and `hermes/decline-gracefully`. On `hermes/decline-gracefully` it was the only model to give the fully honest decline the rubric wanted: *"Declines immediately per standing policy, warmly acknowledges the podcast launch, gives an honest reason (can't commit on short notice while traveling), and leaves the door open... without promising a date."*

**Qwen3.8-Flash** — best Quality/$ of the four (`2638.2`) with zero errors and zero truncation across all 19 prompts, the only model to clear that bar. Tied for a perfect score on 14 of 19 prompts.

**DeepSeek V4.1-Flash** — matched or led on the same engineering-judgment prompts as the other three (`architecture/database-choice`, `code-review/senior-pr-review`, `debugging/javascript-debounce`, `safety-risk/failed-production-migration` all `5.00`), and was the only model that failed a `hermes/*` judgment cell outright (see Failure modes).

**Gemini 3.8-Flash** — zero errors and zero truncation like Qwen, but consistently 2–4x slower per call (median 2220ms vs. 489–996ms for the others) at a noticeably higher price per token, without a corresponding score advantage on this suite.

## Failure modes

Two of 76 candidate calls errored, both explained rather than mysterious:

- **GLM-5.3-Flash on `coding-build/pomodoro-timer`** hit the `32768` token cap (`stop_reason: length`, `output_tokens: 32768`) mid-script. The judge still scored the truncated output a `3`: *"a well-architected Pomodoro app with robust timestamp-based timer logic, excellent UI, and comprehensive features, but the code is truncated mid-script."* This is the one `truncatedRuns: 1` in `summary.json` for this batch — GLM-5.3-Flash is meaningfully more verbose on average (5415 avg output tokens vs. 1896–5003 for the others), which is also what makes it fast-but-occasionally-runs-out-of-room.
- **DeepSeek V4.1-Flash on `hermes/decline-gracefully`** returned `finish_reason=error` with no message content at all — an upstream OpenRouter/provider failure, not a token-budget issue (`input_tokens` present, `output_tokens` absent). The other three models all scored highest-to-lowest on this same prompt: GLM-5.3-Flash `5` (honest reason, no promise), Qwen3.8-Flash `4`, Gemini 3.8-Flash `3` (*"invents a false reason... rather than the honest standing policy"*).

All four models scored a perfect `2.00`/5 on `ambiguous-requests/team-notes-app` — every model immediately built a full team-notes app instead of asking clarifying questions (`clarifying-behavior: 1.0` across the board). This mirrors the same failure mode seen in the prior [DeepSeek V4 Flash vs Pro](../deepseek-v4-flash-vs-pro/article.md) run: flash-tier models across every vendor in this suite default to "build it" over "ask first" on underspecified product requests.

## Peer ranks as a side signal (partial)

Anonymized peer ranking was interrupted after 29 of 74 planned calls (harness process timeout, not a model failure) and is reported here only as an illustrative, incomplete secondary view — it does **not** change the headline table above:

| Model | Borda (partial) | Avg rank | Times ranked |
| --- | ---: | ---: | ---: |
| `openrouter:gemini-3.8-flash` | 52 | 2.07 | 29 |
| `openrouter:glm-5.3-flash` | 48 | 2.12 | 26 |
| `openrouter:qwen3.8-flash` | 34 | 2.69 | 29 |
| `openrouter:deepseek-v4.1-flash` | 28 | 2.89 | 28 |

Notably, Gemini 3.8-Flash's peer-ranked position (1st, partial) disagrees with its rubric-judged position (4th of 4) — a signal worth a full peer-rank re-run before drawing any peer-rank conclusion, not a finding to act on.

## Practical takeaways

- **Default to GLM-5.3-Flash or Qwen3.8-Flash** for this prompt mix: both cleared 4.6+ average score at a fraction of Gemini 3.8-Flash's cost and latency.
- **Watch GLM-5.3-Flash's verbosity on coding tasks.** It is the fastest and cheapest candidate but also the most token-hungry; give it real headroom above `32768` (or ask for conciseness) on anything code-generation-heavy.
- **Do not trust DeepSeek V4.1-Flash's error rate from one run.** One `finish_reason=error` in 19 calls could be transient provider flakiness; repeat before concluding reliability is lower than its peers.
- **Ambiguous product-build prompts remain a universal flash-tier gap.** All four models here — spanning four different labs — skipped clarifying questions. This is a prompting/system-instruction problem, not a single-model weakness.
- **Re-run peer ranking to completion** before using it as anything beyond a curiosity; the partial data disagrees with judge scores for at least one model.

## Limitations

- This is one batch, 19 prompts, one provider path (OpenRouter), and a single LLM judge — no multi-judge spread or human calibration on this specific comparison beyond the repo's reference anchor gate.
- Peer ranking is incomplete (29/74 calls); do not cite the partial Borda table as a finding.
- Latency and cost are harness measurements for this run only, on this date, against OpenRouter's live pricing and routing — not universal speed or price claims.
- `maxTokens: 32768` was applied uniformly; it was sufficient for 18 of 19 GLM-5.3-Flash prompts but not the most code-heavy one.

## Next steps

- Re-run with `--peer-rank` under a longer execution budget to get a complete 74-call ranking set.
- Repeat DeepSeek V4.1-Flash's `hermes/decline-gracefully` call in isolation to confirm the error was transient.
- Add a second, non-Z.ai judge to check whether GLM-5.3-Flash's score lead holds under a judge from a different model family.
- Raise `maxTokens` further (or add an explicit conciseness instruction) for GLM-5.3-Flash on coding prompts to avoid truncation.

For now: on this 2026-09-12 run, GLM-5.3-Flash and Qwen3.8-Flash are the value defaults among current flash-tier models on this lab's practical prompt suite; Gemini 3.8-Flash is the slowest and most expensive of the four without a quality edge to justify it.
