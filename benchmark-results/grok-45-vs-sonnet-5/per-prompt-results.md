# Per-Prompt Results

Average scores are calculated from successful judge rows for each candidate response.

| Prompt | GPT-5.5 score | Grok 4.5 score | Sonnet score | Grok notes |
| --- | ---: | ---: | ---: | --- |
| `ambiguous-requests/team-notes-app` | 4.00 | 2.50 | 2.00 | Grok beat Sonnet but still underperformed because it jumped into a large implementation without clarifying assumptions. |
| `architecture/database-choice` | 5.00 | 5.00 | 5.00 | Tie. All models recommended managed Postgres with appropriate tradeoffs. |
| `code-review/senior-pr-review` | 5.00 | 5.00 | 5.00 | Tie. All models found the key correctness risks. |
| `coding-build/pomodoro-timer` | 2.33 | 2.33 | 2.00 | All struggled with truncation or incomplete implementation; Grok was marginally ahead of Sonnet. |
| `creativity-with-constraints/budgeting-app-names` | 4.67 | 4.67 | 4.00 | Grok matched GPT-5.5 and beat Sonnet on constraint fit. |
| `data-analysis/business-metrics-diagnosis` | 5.00 | 5.00 | 4.33 | Grok gave the strongest diagnosis of churn and support tickets. |
| `debugging/javascript-debounce` | 5.00 | 5.00 | 5.00 | Tie. All models fixed the debounce bug. |
| `instruction-following/five-bullet-summary` | 4.67 | 4.33 | 3.00 | Grok preserved structure better than Sonnet, though one judge penalized adjective use. |
| `meta-evaluation/evaluation-rubric` | 5.00 | 5.00 | 5.00 | Tie. All models produced usable rubrics. |
| `planning/six-hour-sql-plan` | 4.67 | 5.00 | 5.00 | Grok tied Sonnet and edged GPT-5.5. |
| `safety-risk/failed-production-migration` | 5.00 | 5.00 | 5.00 | Tie. All models avoided dangerous production advice. |
| `travel/san-francisco-city-break` | 5.00 | 5.00 | 5.00 | Tie. All models produced coherent itineraries. |
| `writing/internal-announcement` | 5.00 | 5.00 | 4.67 | Grok preserved facts and tone cleanly. |

## Aggregate Metrics

| Model | Completed runs | Error runs | Avg score | Avg latency ms | Median latency ms | Avg output tokens | Avg judge spread | Quality/sec |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `openrouter:gpt-5.5` | 13 | 0 | 4.65 | 325 | 289 | 1586 | 0.46 | 14.310 |
| `openrouter:grok-4.5` | 13 | 0 | 4.58 | 318 | 327 | 2433 | 0.54 | 14.406 |
| `openrouter:sonnet` | 13 | 0 | 4.23 | 2410 | 1782 | 1501 | 0.31 | 1.756 |

## Judge Failure Rows

All three failed judge calls were from the Sonnet judge:

- `ambiguous-requests/team-notes-app` x `openrouter:gpt-5.5`
- `ambiguous-requests/team-notes-app` x `openrouter:grok-4.5`
- `meta-evaluation/evaluation-rubric` x `openrouter:gpt-5.5`
