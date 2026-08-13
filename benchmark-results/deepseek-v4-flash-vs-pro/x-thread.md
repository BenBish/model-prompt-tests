# X Thread Draft

1. I ran DeepSeek V4 Flash vs V4 Pro across 13 practical prompt tests: debugging, code review, planning, writing, data analysis, safety advice, creativity, and ambiguous product requests.

Pro won this small same-lineage bench: 4.50 avg score vs Flash's 4.38.

2. The caveat that actually matters: Pro cost about 21× more ($0.215 vs $0.010) for a +0.12 quality delta. Latency was basically tied.

This is not a universal ranking. One repo-local run, OpenRouter, two peer judges (GPT-5.5 + Sonnet 5).

3. They tied at 5.00 on the core engineering prompts: database choice, senior PR review, JavaScript debounce, and a failed production migration.

If those are your tasks, Flash is the default.

4. Pro earned the headline on writing, travel, constrained naming, format-heavy summarization, and a six-hour SQL lesson plan.

Flash won the Pomodoro build, the business-metrics diagnosis, and rubric design.

5. Both failed the same way on "build a team notes app." The rubric wanted clarifying questions. Both shipped a full-stack blueprint. More architecture was not better.

6. Peer ranks (anonymized, secondary only) tied on Borda 39–39. In a two-model cell each model usually ranks itself first. When both rankers agreed, they usually matched the rubric. Do not blend ranks into the headline score.

7. Practical takeaway: Flash is the value default. Pro is the writing/precision upgrade, not a different engineering model on this suite.
