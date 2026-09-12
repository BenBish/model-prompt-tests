# X Thread Draft

1. I ran 4 current flash-tier models across 19 practical prompt tests: coding, debugging, code review, planning, writing, data analysis, safety advice, and hermes-style judgment cases.

GLM-5.3-Flash led with a 4.83 avg score, but every model landed in a tight 4.58-4.83 band.

2. The caveat that matters: cost and latency spread far wider than quality. GLM-5.3-Flash: $0.0465 total, 761ms avg latency. Gemini 3.8-Flash: $0.1368, 3345ms avg — 3× the price and 4.4× the latency for the *lowest* score of the four.

This is not a universal ranking. One repo-local run, OpenRouter, single LLM judge (calibrated against the repo's reference anchors).

3. Where GLM-5.3-Flash won: fastest, cheapest, and the only model that gave the fully honest decline on a hermes judgment prompt instead of inventing a reason.

Qwen3.8-Flash had the best quality-per-dollar of the four and zero errors or truncation across all 19 prompts.

4. Where they all failed the same way: every model skipped clarifying questions on an ambiguous "build a team notes app" request and shipped a full app instead. Four different labs, one shared blind spot.

GLM-5.3-Flash also truncated mid-script on the Pomodoro-timer build after hitting a 32,768-token cap — it's the most verbose of the four.

5. DeepSeek V4.1-Flash hit a bare provider error (no content returned) on one hermes prompt — worth a repeat run before calling it a reliability finding.

6. Peer ranks (anonymized, secondary signal) were cut short by a harness timeout (29/74 calls) and partially disagree with the judge scores — not reliable enough to quote yet.

7. Practical takeaway: GLM-5.3-Flash and Qwen3.8-Flash are the value defaults on this suite. Gemini 3.8-Flash is the slowest and most expensive of the four without a quality edge to show for it.
