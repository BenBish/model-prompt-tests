# Hermes 3-agent local model bake-off (BSH-206)

**Keep Qwen3.6-27B UD-Q4_K_XL on `llama-toolbox-qwen-hermes.service` (12346).** No shortlist challenger beats it on EA quality *and* the 90% well-formed tool-call gate. Do not swap to LFM2.5-8B-A1B or Nemotron 3.5 Lightning instruct.

The way to get a third concurrent Hermes profile is a **serving-shape change** on the incumbent (`-np 3`, 65K/slot), not a model change. That 3-slot reshape was not applied to production in this spike.

## Headline

All `hermes/*` arms are 6 prompts × 3 repeats, judge `openrouter:gpt-5.5`. Live arms hit llama-swap (production). Lab arms hit 12348 coexist (`HALO_EXCLUSIVE=0`, `-np 3 -c 196608`) so OpenCode and Gemma stayed up.

| Model | Route | Tool well-formed | Correct tool | `hermes/*` avg | Avg latency | Empty | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| **Qwen3.6-27B UD-Q4_K_XL** | live 12346, `-np 2` | **100%** | **100%** | **4.11** | 19.0s | 0/18 | **Keep.** |
| Gemma 4 26B-A4B | live 12345 | 100% | 90% | 3.50 | 12.6s | 0/18 | Faster, worse EA. Failed 1 negative tool case. |
| Ornith 1.5 Q4, reasoning off | 12348, `-np 3` | 80% | 80% | 3.28 | 9.2s | 0/18 | DQ on tool gate. Faster, not better. |
| LFM2.5-8B-A1B Q4_K_M | 12348, `-np 3` | 80% | 70% | 3.00 | 12.8s | 0/18 | DQ. Fast coexist, weak triage/risk. |
| Qwen3.6-35B-A3B | 12348, `-np 3` | 100% | 70% | 2.94 | 4.8s | 1/18 | Tools well-formed, wrong tool too often. Coder-tuned. 1 socket drop. |
| Lightning 30B-A3B instruct UD-Q4_K_XL | 12348, `-np 3` HIP | 80% | 60% | 2.44 | 44.9s | 0/18 | DQ. HIP loads. Hits `length` on inbox-triage. |

Tool gate is `bun bench hermes tools` (10 Chat Completions cases, 3 negatives). **&lt;90% well-formed is disqualifying.**

Batches: live `2026-08-21T23-25-26-316Z-4vel7v`; LFM `…-rq8ye7`; Ornith-off `…-1up0da`; Lightning `…-lleo2m`; Qwen-35B `2026-08-22T00-00-29-054Z-krgjvx`. Tool probes: `…-fv0eda` (live), `…-3tlx71` (LFM), `…-z7hncy` (Ornith), `…-3jroc1` (Lightning), `…-izxfej` (Qwen-35B).

## Decision rule applied

Replace 12346 only if a candidate passes the 90% tool gate, matches or beats 4.11 without &gt;5% empty, **and** is ≥1.5× faster under 3-slot contention **or** clearly better on judgment + temporal. **Nobody qualifies.**

The 2026-08-20 one-shot control (3.17, temporal=2) was a thin sample. This 18-cell rerun of the same production 27B is **4.11**, temporal-correctness **5.0**. Judgment stays the weak dimension (2.67) — `decline-gracefully` is 2.67 for Qwen and ≤2.33 for every challenger.

## Per-prompt (avg / 5)

| Prompt | Qwen 27B | Gemma | Ornith-off | LFM2.5 | Qwen 35B | Lightning |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| calendar-conflict | **4.67** | 4.33 | 4.33 | 2.33 | **4.67** | 1.00 |
| decline-gracefully | 2.67 | 2.00 | 2.00 | **3.33** | 1.67 | 2.33 |
| draft-reply-tone | **5.00** | **5.00** | 3.67 | 3.33 | **5.00** | 3.00 |
| inbox-triage | **3.00** | 2.67 | 2.67 | 1.00 | 2.00 | 1.00 |
| multi-step-errand | **4.33** | 4.00 | 4.00 | 4.00 | 2.33 | 3.00 |
| recall-and-contradict | **5.00** | 3.00 | 3.00 | 4.00 | 2.67 | 4.33 |

Key dimensions (judge `dimension_scores`):

| Model | judgment | temporal | no-fabrication | triage | risk |
| --- | ---: | ---: | ---: | ---: | ---: |
| Qwen 27B | 2.67 | **5.0** | **5.0** | **3.0** | **5.0** |
| Gemma | 2.00 | 4.33 | 4.83 | 3.0 | 5.0 |
| Ornith-off | 2.00 | 4.67 | 4.83 | 2.33 | 5.0 |
| LFM2.5 | **3.33** | 2.0 | 4.83 | 1.0 | 1.0 |
| Qwen 35B | 1.67 | 5.0 | 4.0 | 1.67 | 3.33 |
| Lightning | 2.33 | 5.0 | 4.83 | 1.0 | 1.0 |

LFM is the only model that *improves* judgment, and it does it by wrecking triage and phishing detection. Not an EA.

## What this means for three agents

- **One process, three slots** remains the right topology. Three instances of a 20 GB model waste ~40 GB for no quality gain.
- LFM is the only weights-small-enough model for three *instances*, and it failed the tool gate.
- Coexist RAM is real: ~45 GiB free with production Hermes+OpenCode+Gemma loaded. A 12348 lab of 6–24 GB loaded without stopping Tom/Freddy.
- Incumbent 3-slot reshape (`-c 196608 -np 3` on the same 27B GGUF) is the next ops experiment. Not done here; live 12346 stayed at two 65K slots.

## Not run

- **gpt-oss-20B MXFP4** — not on disk; skipped after incumbent already won the gate+quality pair.
- Exclusive-GPU windows (`HALO_EXCLUSIVE=1`) — not needed; coexist 12348 was the locked production constraint.
- LFM2.5 thinking-on — reasoning-off already DQed on tools.

## Go / no-go

**No-go on swapping `llama-toolbox-qwen-hermes.service`.** Keep Qwen3.6-27B UD-Q4_K_XL, HIP, `--jinja`, `--reasoning off`. Follow-up (not this PR): try `-np 3` on that unit after a short exclusive window, and treat `decline-gracefully` as a prompt/policy problem rather than a model-swap problem.
