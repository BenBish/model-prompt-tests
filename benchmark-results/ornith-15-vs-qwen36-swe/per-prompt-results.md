# Per-cell SWE results (12-cell comparison batches)

Smoke-gate cells are omitted here. `verify` is binary. `tests` is `passed/total` from `bun test`. Decode tok/s is llama.cpp `/metrics` predicted tokens / predicted seconds.

## `codex-lab:qwen36-35b-rerun` (`2026-08-21T05-06-21-916Z-gm09uz`)

| Task | Repeat | Verify | Tests | Timeout | Agent ms | Decode tok/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| cart-discount | 1 | pass | 4/4 | no | 75696 | 45.4 |
| cart-discount | 2 | pass | 4/4 | no | 85016 | 44.5 |
| cart-discount | 3 | pass | 4/4 | no | 72006 | 44.8 |
| debounce-fix | 1 | pass | 2/2 | no | 43648 | 44.7 |
| debounce-fix | 2 | pass | 2/2 | no | 63543 | 45.0 |
| debounce-fix | 3 | pass | 2/2 | no | 29173 | 44.1 |
| pomodoro-timer | 1 | fail | 7/9 | no | 190367 | 42.3 |
| pomodoro-timer | 2 | fail | 6/9 | no | 143037 | 42.5 |
| pomodoro-timer | 3 | fail | 7/9 | no | 204147 | 42.1 |
| smoke | 1 | pass | 2/2 | no | 42436 | 45.3 |
| smoke | 2 | pass | 2/2 | no | 33071 | 45.1 |
| smoke | 3 | pass | 2/2 | no | 35504 | 44.9 |

## `codex-lab:ornith-15-q4-noreasoning` (`2026-08-21T05-27-06-012Z-797uxn`)

| Task | Repeat | Verify | Tests | Timeout | Agent ms | Decode tok/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| cart-discount | 1 | pass | 4/4 | no | 81533 | 50.8 |
| cart-discount | 2 | pass | 4/4 | no | 88257 | 50.9 |
| cart-discount | 3 | pass | 4/4 | no | 119774 | 50.7 |
| debounce-fix | 1 | pass | 2/2 | no | 78270 | 50.8 |
| debounce-fix | 2 | pass | 2/2 | no | 22748 | 51.2 |
| debounce-fix | 3 | pass | 2/2 | no | 49138 | 50.7 |
| pomodoro-timer | 1 | fail | 5/9 | no | 132959 | 49.6 |
| pomodoro-timer | 2 | fail | 6/9 | no | 564872 | 44.9 |
| pomodoro-timer | 3 | fail | 5/16 | yes | 600013 | 43.6 |
| smoke | 1 | pass | 2/2 | no | 26720 | 50.6 |
| smoke | 2 | pass | 2/2 | no | 30078 | 51.8 |
| smoke | 3 | fail | 0/2 | yes | 600010 | 45.9 |

Pomodoro repeat 3 for Ornith timed out; `bun test` reported 16 tests across 4 files instead of the usual 9 across 3, so that cell's 31% is a timeout artifact. The other two Ornith Pomodoro cells are 5/9 and 6/9 against Qwen's 7/9, 6/9, 7/9.
