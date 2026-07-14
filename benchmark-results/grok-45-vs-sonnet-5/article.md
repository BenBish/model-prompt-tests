# Grok 4.5 vs Sonnet 5 on Practical Prompt Tests

On this benchmark run, Grok 4.5 narrowly outscored Sonnet 5 across a small suite of practical prompt tasks: `4.58` average score for Grok 4.5 versus `4.23` for Sonnet 5. The result is not a sweeping model ranking. It is a snapshot of how these two models behaved on 13 repository-local prompts covering debugging, code review, planning, writing, data analysis, safety advice, creativity, and ambiguous product requests.

The short version: Grok 4.5 was consistently strong on structured reasoning and instruction-following tasks, and it produced more expansive answers than Sonnet 5. Sonnet 5 remained competitive on many tasks, tying Grok on several high-signal prompts, but it lost ground on constraint-heavy summarization, business diagnosis, and a few writing or ideation tasks. Both models struggled when the prompt invited a full app build with limited output budget.

## Methodology

The benchmark used the prompt tests in this repository and the local benchmark harness under `bench/`. Each prompt includes the user-facing task plus an evaluation rubric. The run executed every prompt against the same model set through OpenRouter:

- `openrouter:grok-4.5` mapped to `x-ai/grok-4.5`
- `openrouter:sonnet` mapped to `anthropic/claude-sonnet-5`
- `openrouter:gpt-5.5` mapped to `openai/gpt-5.5`

The headline comparison is Grok 4.5 versus Sonnet 5. GPT-5.5 was included as an additional candidate and judge, which gives useful context but is not the focus of this write-up.

The run used `reasoningEffort: "medium"` for all three OpenRouter models, `maxConcurrent: 1`, and a `300000` ms timeout per candidate model. The batch ID was `2026-07-13T03-39-20-964Z-y7fo6o`.

Scoring used three judge models: GPT-5.5, Grok 4.5, and Sonnet 5. Candidate score averages use successful judge rows only. All 39 candidate responses completed successfully. Three Sonnet judge calls failed because the judge did not return valid JSON after two attempts; those failed judge rows are preserved in the artifacts and excluded from score averages.

Supporting artifacts:

- [Run config](./run-config.md)
- [Aggregate summary JSON](./summary.json)
- [Per-prompt results](./per-prompt-results.md)
- [Raw outputs and score rationales](./raw-outputs-and-scores.json)

## Headline Results

| Model | Completed runs | Avg score | Avg latency ms | Median latency ms | Avg output tokens | Avg judge spread | Quality/sec |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `openrouter:gpt-5.5` | 13 | 4.65 | 325 | 289 | 1586 | 0.46 | 14.310 |
| `openrouter:grok-4.5` | 13 | 4.58 | 318 | 327 | 2433 | 0.54 | 14.406 |
| `openrouter:sonnet` | 13 | 4.23 | 2410 | 1782 | 1501 | 0.31 | 1.756 |

Grok 4.5 finished close to GPT-5.5 and ahead of Sonnet 5 on average quality. It also produced the longest responses by a wide margin: about `2433` output tokens on average versus Sonnet's `1501`. That extra verbosity helped on some tasks and hurt on others.

The reported latency numbers should be treated as harness measurements for this OpenRouter run, not a universal speed claim. They are still useful for comparing this exact batch because the models were run through the same harness and provider path.

## Where Grok 4.5 Looked Strong

Grok was excellent on several practical engineering and analysis prompts. It tied for perfect scores on database selection, senior code review, JavaScript debugging, rubric design, SQL lesson planning, migration safety, travel planning, and an internal announcement rewrite. It also beat Sonnet on the business-metrics diagnosis, where judges credited Grok for centering the combined churn and support-ticket signal.

On the business diagnosis prompt, Grok led with the core issue directly: churn rose from `28` to `79`, support tickets rose from `310` to `940`, and net customer growth was fading despite revenue growth. Sonnet also identified the same pattern, but Grok's average score was `5.00` versus Sonnet's `4.33`.

Grok also performed better on the five-bullet summary task. The prompt was constraint-heavy: exactly five bullets, each under 12 words, no adjectives, and preservation of key facts. Grok scored `4.33`; Sonnet scored `3.00`. The difference came down to instruction precision. Sonnet used words such as "Historical" and "Existing", which judges treated as adjective violations.

## Where Sonnet 5 Stayed Competitive

Sonnet tied Grok on many tasks. Both models received perfect average scores on:

- `architecture/database-choice`
- `code-review/senior-pr-review`
- `debugging/javascript-debounce`
- `meta-evaluation/evaluation-rubric`
- `planning/six-hour-sql-plan`
- `safety-risk/failed-production-migration`
- `travel/san-francisco-city-break`

That matters. The headline average favors Grok, but the per-task table shows that Sonnet was not broadly weak. It lost the benchmark through smaller misses on several prompts rather than collapse on the core reasoning tasks.

## Failure Modes

The lowest-scoring task for both Grok and Sonnet was the ambiguous request: "build a team notes app." The rubric favored clarifying questions, explicit assumptions, and a scoped MVP. Grok and Sonnet both jumped into large full-stack implementations. Grok scored `2.50`; Sonnet scored `2.00`.

That is a useful practical signal. When the user prompt is ambiguous, a bigger implementation is not necessarily better. The best answer in this run stated assumptions and scoped the product before implementation.

The Pomodoro timer build task exposed another issue: truncation and incomplete runnable code. Grok and GPT-5.5 averaged `2.33`; Sonnet averaged `2.00`. Judges repeatedly noted that responses began as polished single-file apps but were cut off before all JavaScript and closing markup were complete. This is a benchmark weakness too: a single-turn coding task with a large expected artifact can turn into an output-budget test as much as a coding-quality test.

## Practical Takeaways

For this prompt set, Grok 4.5 looked like the stronger general-purpose performer than Sonnet 5. It scored higher overall, matched Sonnet on the strongest engineering and safety prompts, and beat Sonnet on several constraint-following and analysis tasks.

Sonnet 5 still looked dependable on many reasoning-heavy prompts. Its weaker average came from a handful of misses, especially constraint precision and ambiguous task handling. If your workflow depends on concise outputs, Sonnet's lower average token count may also be attractive, but this run did not reward brevity by itself.

The biggest operational takeaway is not "always use Grok" or "always use Sonnet." It is that model choice depends on the task shape:

- Use Grok 4.5 when you want expansive analysis, strong structured reasoning, and robust performance across mixed practical tasks.
- Be careful with Grok 4.5 on ambiguous product-build prompts; it may overbuild unless the system prompt forces clarification and scoping.
- Use Sonnet 5 confidently for many engineering-review, debugging, planning, safety, and travel-style reasoning tasks, but watch constraint-heavy formatting and summarization.
- For large single-turn coding artifacts, add explicit output-size constraints or require incremental file edits instead of one giant response.

## Limitations

This benchmark is intentionally small: 13 prompts, one run batch, one provider path, and LLM-based judging. The prompt suite is useful because it reflects practical tasks, but it is not a statistically broad benchmark.

There are also judge caveats. The run used three model judges, including the compared models themselves. Multi-judge scoring reduces single-judge bias, but it does not eliminate model preference, rubric interpretation differences, or failure to return valid structured output. Three Sonnet judge rows failed and were excluded from averages.

Finally, the model labels reflect the local OpenRouter configuration used for this run. Re-running through different providers, settings, model snapshots, or prompt budgets could change the results.

## Next Steps

The most useful follow-up would be a repeat run with:

- Multiple batches to estimate variance.
- A larger prompt suite, especially more coding tasks that produce files rather than long single-message artifacts.
- Separate analysis of answer quality versus verbosity.
- Human review of the highest-disagreement cases.
- Fixed judge order and stricter structured-output retry behavior.

For now, the measured conclusion is narrow but clear: on this July 13, 2026 benchmark run, Grok 4.5 beat Sonnet 5 on average across this repository's practical prompt tests, while Sonnet remained competitive on many of the highest-signal engineering and reasoning tasks.
