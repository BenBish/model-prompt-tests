# X Thread Draft

1. I benched all 17 models in OpenRouter's free-models collection across 19 practical prompt tests. $0.00 per answer, multi-judge rubric scoring.

nemotron-3-super-free led with a 4.25 avg score at 212 ms per answer.

The catch: only 214 of 323 responses ever completed.

2. The caveat: this is not a universal model ranking. One repo-local benchmark run with two LLM judges (GPT-5.5, Sonnet 5). Raw outputs, config, and rationales are in the repo.

3. Where the winner looked strongest: nemotron-3-super topped the score table while answering in about 200 ms. dots3-note-preview tied for the top score on 6 of 19 prompts, but burned two full prompts on reasoning that ate the entire token budget and returned nothing.

4. Where models struggled: the ambiguous "build me a notes app" prompt capped at 2.50 for every model. Nobody asked a clarifying question. On the Pomodoro build, four models scored 1.00: code that does not run.

And the availability story: both Gemma 4 tiers and both Inkling tiers answered zero prompts. Gemma: upstream 429s all night. Inkling: 403, free tier is agentic-harness-only.

5. Practical takeaway: nemotron-3-super-free for interactive use, minimax-m3-free or ling-3-flash-fin-free for batch work that can retry throttles. The free tier's real price is the third of requests that never return.

6. Full write-up: https://bshp.io/articles/openrouter-free-models-benchmark/
