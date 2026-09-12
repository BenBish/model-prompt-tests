# Per-Prompt Results

Average scores are calculated from successful peer-judge rows (self-judging excluded) for each candidate response.

| Prompt | `openrouter:deepseek-v4.1-flash` score | `openrouter:gemini-3.8-flash` score | `openrouter:glm-5.3-flash` score | `openrouter:qwen3.8-flash` score | Notes (fill in) |
| --- | ---: | ---: | ---: | ---: | --- |
| `ambiguous-requests/team-notes-app` | 2.00 | 2.00 | — | 2.00 | All four skip clarifying questions, build a full app |
| `architecture/database-choice` | 5.00 | 5.00 | 5.00 | 5.00 | Tie |
| `code-review/senior-pr-review` | 5.00 | 5.00 | 5.00 | 5.00 | Tie |
| `coding-build/pomodoro-timer` | 5.00 | 5.00 | 3.00 | 4.00 | GLM truncated at 32768-token cap mid-script |
| `creativity-with-constraints/budgeting-app-names` | 5.00 | 5.00 | 5.00 | 5.00 | Tie |
| `data-analysis/business-metrics-diagnosis` | 5.00 | 5.00 | 5.00 | 5.00 | Tie |
| `debugging/javascript-debounce` | 5.00 | 5.00 | 5.00 | 5.00 | Tie |
| `hermes/calendar-conflict` | 5.00 | 4.00 | 5.00 | 5.00 | Gemini alone dinged |
| `hermes/decline-gracefully` | — | 3.00 | 5.00 | 4.00 | DeepSeek errored (finish_reason=error); Gemini invented a false reason, GLM gave the honest one |
| `hermes/draft-reply-tone` | 5.00 | 5.00 | 5.00 | 5.00 | Tie |
| `hermes/inbox-triage` | 4.00 | 4.00 | 4.00 | 4.00 | Tie |
| `hermes/multi-step-errand` | 4.00 | 4.00 | 5.00 | 5.00 | GLM/Qwen edge DeepSeek/Gemini |
| `hermes/recall-and-contradict` | 5.00 | 5.00 | 5.00 | 5.00 | Tie |
| `instruction-following/five-bullet-summary` | 5.00 | 5.00 | 5.00 | 5.00 | Tie |
| `meta-evaluation/evaluation-rubric` | 5.00 | 5.00 | 5.00 | 5.00 | Tie |
| `planning/six-hour-sql-plan` | 5.00 | 5.00 | 5.00 | 5.00 | Tie |
| `safety-risk/failed-production-migration` | 5.00 | 5.00 | 5.00 | 5.00 | Tie |
| `travel/san-francisco-city-break` | 5.00 | 5.00 | 5.00 | 5.00 | Tie |
| `writing/internal-announcement` | 5.00 | 5.00 | 5.00 | 5.00 | Tie |

## Aggregate Metrics

| Model | OK | Errors | Score (peer) | Score (self) | Score σ | Avg latency ms | Avg output tokens | Avg judge spread | Quality/sec | Total cost | Quality/$ | Truncated |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `openrouter:deepseek-v4.1-flash` | 18 | 1 | 4.72 | — | 0.73 | 1034 | 5003 | — | 4.567 | $0.0908 | 936.5 | 0 |
| `openrouter:gemini-3.8-flash` | 19 | 0 | 4.58 | — | 0.82 | 3345 | 1896 | — | 1.369 | $0.1368 | 635.9 | 0 |
| `openrouter:glm-5.3-flash` | 18 | 1 | 4.83 | — | 0.50 | 761 | 5415 | — | 6.348 | $0.0465 | 1872.2 | 1 |
| `openrouter:qwen3.8-flash` | 19 | 0 | 4.68 | — | 0.73 | 979 | 3724 | — | 4.783 | $0.0337 | 2638.2 | 0 |

## Judge Failure Rows

None -- every judge call returned a valid score.
