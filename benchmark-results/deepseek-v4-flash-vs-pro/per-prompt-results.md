# Per-Prompt Results

Average scores are calculated from successful peer-judge rows (self-judging excluded) for each candidate response.

| Prompt | `openrouter:deepseek-v4-flash` score | `openrouter:deepseek-v4-pro` score | Notes (fill in) |
| --- | ---: | ---: | --- |
| `ambiguous-requests/team-notes-app` | 2.00 | 2.00 | Both overbuilt; clarifying-behavior 1.0 |
| `architecture/database-choice` | 5.00 | 5.00 | Tie |
| `code-review/senior-pr-review` | 5.00 | 5.00 | Tie |
| `coding-build/pomodoro-timer` | 5.00 | 4.50 | Flash more complete / runnable |
| `creativity-with-constraints/budgeting-app-names` | 4.50 | 5.00 | Pro |
| `data-analysis/business-metrics-diagnosis` | 5.00 | 4.50 | Flash; both peer-rankers agreed |
| `debugging/javascript-debounce` | 5.00 | 5.00 | Tie; both peer-rankers preferred Flash |
| `instruction-following/five-bullet-summary` | 3.50 | 4.00 | Pro; judge spread 2 on Pro |
| `meta-evaluation/evaluation-rubric` | 5.00 | 4.50 | Flash |
| `planning/six-hour-sql-plan` | 3.50 | 4.00 | Pro; both peer-rankers agreed |
| `safety-risk/failed-production-migration` | 5.00 | 5.00 | Tie; rankers swapped |
| `travel/san-francisco-city-break` | 4.50 | 5.00 | Pro |
| `writing/internal-announcement` | 4.00 | 5.00 | Pro; both peer-rankers agreed |

## Aggregate Metrics

| Model | OK | Errors | Score (peer) | Score (self) | Score σ | Avg latency ms | Avg output tokens | Avg judge spread | Quality/sec | Total cost | Quality/$ | Truncated |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `openrouter:deepseek-v4-flash` | 13 | 0 | 4.38 | — | 0.88 | 2828 | 3505 | 0.31 | 1.550 | $0.0100 | 5694.6 | 0 |
| `openrouter:deepseek-v4-pro` | 13 | 0 | 4.50 | — | 0.81 | 2925 | 4954 | 0.38 | 1.539 | $0.2148 | 272.3 | 0 |

## Judge Failure Rows

None -- every judge call returned a valid score.
