---
type: fixture
verify: bun test
verifyTimeoutMs: 30000
agentTimeoutMs: 300000
tags: typescript, debugging, timers
---
# Fix the debounce utility

## Task

```text
The debounce function in src/debounce.ts is supposed to delay calling `fn` until activity has
stopped for `delay` ms, but it sometimes calls `fn` more than once if invoked multiple times in
quick succession. Find the bug and fix it. Run the tests to confirm your fix. Do not modify the
test files.
```

## Judging Guidance

- Reward identifying that a prior scheduled call is never cancelled.
- Reward preserving `this` and arguments in the fixed version.
- Penalize rewriting debounce into throttle behavior.

## Scoring Dimensions

- `correctness` (weight 3): Only the most recent call's arguments trigger `fn`, and only once.
- `code-quality` (weight 2): Minimal fix that preserves the function's calling contract (`this`/args).
