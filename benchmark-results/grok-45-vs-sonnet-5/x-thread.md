# X Thread Draft

1. I ran Grok 4.5 vs Sonnet 5 across 13 practical prompt tests: debugging, code review, planning, writing, data analysis, safety advice, creativity, and ambiguous product requests.

Grok won this small benchmark: 4.58 avg score vs Sonnet's 4.23.

2. The caveat: this is not a universal model ranking.

It is one repo-local benchmark run, through OpenRouter, with `reasoningEffort: medium`, 13 prompts, and multi-judge LLM scoring.

Raw outputs, config, and score rationales are preserved in the repo.

3. Where Grok looked strongest:

- business diagnosis
- constraint-heavy summaries
- structured planning
- expansive analysis

It also tied Sonnet on several engineering tasks: code review, debugging, database choice, migration safety, and rubric design.

4. Where both models struggled:

Ambiguous app-build prompts.

For "build a team notes app," both Grok and Sonnet jumped into large full-stack implementations instead of clarifying scope first. More code was not better there.

5. Another weak spot: large single-turn coding artifacts.

On the Pomodoro timer task, responses often started well but were cut off or incomplete. That says as much about benchmark design and output budgeting as model quality.

6. Practical takeaway:

Grok 4.5 looked stronger overall in this run, especially for expansive structured work.

Sonnet 5 was still solid on many engineering and reasoning prompts, but lost ground on constraints and a few practical tasks.

7. Full write-up, methodology, caveats, and raw artifacts:

[link]
