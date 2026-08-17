---
type: fixture
verify: bun test
verifyTimeoutMs: 60000
agentTimeoutMs: 600000
tags: javascript, frontend, state-management, browser, accessibility
---
# Build a robust Pomodoro timer

## Task

```text
Complete the Pomodoro timer in this repository using plain HTML, CSS, and JavaScript. Keep the
existing module boundaries and public timer API used by the visible tests.

The app must support configurable work and break durations, start, pause, resume, and reset. It
must switch modes when a phase completes, show a visual and accessible completion alert, remain
usable on narrow screens, and avoid duplicate timers. Timer state must be based on elapsed time
rather than assuming every interval callback arrives exactly on schedule. Applying settings at
any point must stop the active timer and reset to a fresh work session using the new durations.

Run the tests to confirm your change. Do not modify test files or add dependencies.
```

## Judging Guidance

- Treat hidden browser and deterministic-clock verification as the primary correctness signal.
- Reward a small timer state machine with injected clock/scheduler dependencies and clean DOM wiring.
- Penalize decrement-per-tick countdowns, duplicate intervals, inaccessible status changes, or code that only special-cases visible tests.

## Scoring Dimensions

- `functional-correctness` (weight 3): All hidden timer and browser workflows pass, including drift, mode transitions, pause/resume, reset, and settings.
- `accessibility-ui` (weight 2): Controls are keyboard-usable, status changes are announced, and the layout remains usable on narrow screens.
- `code-quality` (weight 2): Timer logic is separated from DOM wiring, dependencies are injectable, and cleanup prevents leaked intervals/listeners.
