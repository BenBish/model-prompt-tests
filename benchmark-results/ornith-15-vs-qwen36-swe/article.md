# Ornith 1.5 vs Qwen3.6 on SWE, reasoning off, partial-credit scoring

The hypothesis was: with reasoning off, Ornith 1.5 is slightly slower but a more capable local coding model than Qwen3.6. On this run it is **refuted**.

Qwen3.6 still wins the 12-cell `codex-lab` fixture suite on both binary Verify rate and partial-credit Avg test pass %. Ornith is not slightly slower: two 600s timeouts more than doubled its mean agent wall clock. Raw decode is the one place Ornith is ahead.

This is the first comparison after [BSH-187](https://linear.app/bshp/issue/BSH-187) promoted Pomodoro into an executable fixture and the follow-up PR added `avgVerifyPassRate` plus the public Pomodoro API contract. The previous corrected Halo run (2026-08-20, same `codex-lab` 12-cell contract at a 300s clip) tied both models at 9/12 (75%) binary pass, with Pomodoro 0/3 for everyone and no per-test credit. Binary pass/fail could not separate them. Partial credit can, and it does not favor Ornith.

## Headline results

12-cell comparison batches only (smoke-gate cells excluded). Each arm is four fixtures × three repeats, reasoning off, exclusive Strix Halo `llama-server`, Codex 0.148.0, 600s agent timeout so Pomodoro uses its native budget instead of the old 300s clip.

| Model | Verify | Avg test pass % | Avg agent ms | Decode tok/s | Prompt tok/s | Timeouts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `codex-lab:qwen36-35b-rerun` | **9/12 (75%)** | **93.5%** | **84,804** | 44.2 | 687.2 | 0 |
| `codex-lab:ornith-15-q4-noreasoning` | 8/12 (66.7%) | 79.5% | 199,531 | **49.3** | 528.1 | 2 |

- **Capability:** Qwen is ahead on both binary and partial credit. The gap is Pomodoro (Qwen closer to a pass) plus one Ornith smoke timeout.
- **Speed:** Ornith decodes ~11% faster (49.3 vs 44.2 tok/s) and is still much slower on the wall clock because two cells hit the 600s ceiling.
- **Main-agent pick:** keep Qwen3.6-35B-A3B as the local coding default. Ornith thinking-off is not a quality upgrade on this harness.

## Per-task

| Task | Qwen verify | Qwen avg tests | Ornith verify | Ornith avg tests |
| --- | ---: | ---: | ---: | ---: |
| `fixture/smoke` | 3/3 | 100% | 2/3 | 66.7% |
| `fixture/cart-discount` | 3/3 | 100% | 3/3 | 100% |
| `fixture/debounce-fix` | 3/3 | 100% | 3/3 | 100% |
| `fixture/pomodoro-timer` | 0/3 | **74.1%** | 0/3 | 51.2% |

Easy fixtures still do not discriminate: both models clear cart-discount and debounce-fix 3/3. Smoke is 3/3 for Qwen; Ornith's third smoke repeat timed out at 600s with 0/2 tests (a reliability miss on a one-line `a - b` → `a + b` fix it had already passed twice, and on the smoke gate).

Pomodoro is the new signal. Neither model fully passes. Qwen consistently lands 6–7 of 9 tests; Ornith lands 5–6 of 9 on the two cells that finished, and a timeout cell whose `bun test` summary counted 16 tests (5/16) because leftover visible files mixed into the hidden-test run.

## What partial credit shows on Pomodoro

Before the contract fix, Pomodoro was 0/46 for every model and unusable as a ranking task. After the fix, both agents finish a real attempt and fail a handful of hidden tests instead of a wall of mismatches.

Typical remaining Qwen failures:

- `pause freezes elapsed time and resume uses the remainder` — pause does not freeze remaining time (stays at the full 10s work duration after 3.2s elapsed).
- Browser/CDP: either the app did not mount (`document.readyState === 'complete' && Boolean(globalThis.__pomodoro)`) or Start did not flip the button to Pause.

Typical remaining Ornith failures: the same pause/elapsed-time remainder, plus completion not firing `onComplete`, plus the delayed-interval elapsed-time test on some repeats. Ornith is not closer to a Pomodoro pass than Qwen; it is farther.

Qwen Pomodoro repeats: 7/9, 6/9, 7/9 in 143–204s, no timeouts.
Ornith Pomodoro repeats: 5/9 in 133s, 6/9 in 565s, 5/16 (timeout) at 600s.

## Hypothesis verdict

| Claim | Result |
| --- | --- |
| Ornith is more capable than Qwen3.6 | **No.** Qwen 75% vs 66.7% verify; 93.5% vs 79.5% avg test pass. |
| Ornith is only slightly slower | **No.** Mean agent time 199.5s vs 84.8s. Decode is faster; wall clock is not. |

The previous 9/12 binary tie was real for the easy fixtures and a 300s Pomodoro that nobody could finish. With a fairer Pomodoro budget and per-test credit, Qwen remains the better local coding agent on this box.

Do not promote Ornith onto the OpenCode 12347 default. If Ornith is reconsidered, the interesting leftover is decode speed with thinking off — not SWE quality.

## Scope notes

- Harness is `codex-lab` only. Both aliases resolve to whatever weights `LAB-CANDIDATE` is serving, so the two arms ran sequentially with an exclusive GPU window each, not as one `swe run --models a,b` matrix.
- Task set is the lab 12-cell fixture contract (`fixture/*` × 3), including the fixed `pomodoro-timer`. Code-review and `external/tiny-add` were left out so latency and verify rates stay comparable to the 2026-08-20 corrected board.
- Agent timeout was 600s (Pomodoro's own `agentTimeoutMs`) rather than the 300s clip used on that earlier board.
- The interactive `report.html` is `--all-runs` on this worktree DB (13 cells/arm, smoke-gate included). Headline tables above use the 12-cell comparison batches only.

Supporting artifacts: [run config](./run-config.md), [per-task cells](./per-prompt-results.md), [summary JSON](./summary.json), [cell dump](./cells.json), [assessment](./assessment.md), [interactive report](./report.html).
