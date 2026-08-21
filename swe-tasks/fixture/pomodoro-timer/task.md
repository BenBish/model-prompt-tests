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

Implement `createPomodoroTimer` in `project/src/timer.js` and `mountPomodoro` in
`project/src/app.js` against this exact public contract:

`createPomodoroTimer(options)` accepts `{ workSeconds, breakSeconds, now, setIntervalFn,
clearIntervalFn, onChange, onComplete }`, all optional. `workSeconds` defaults to `1500` (25
minutes) and `breakSeconds` to `300` (5 minutes) when omitted; the app mounts with no explicit
durations and must show "25:00" initially. If provided, `workSeconds` and `breakSeconds` must be
finite positive numbers or the call throws. It returns an object with:
- `getState()` — returns exactly `{ mode, status, remainingSeconds, workSeconds, breakSeconds }`,
  no other fields. `mode` is `"work"` or `"break"`; `status` is `"idle"`, `"running"`, or
  `"paused"`. `remainingSeconds` is always a non-negative integer: round up any partial second of
  elapsed time (`Math.ceil`), the same convention already used by the given `formatTime` helper.
- `start()`, `pause()`, `reset()` — as described above.
- `setDurations({ workSeconds, breakSeconds })` — this exact method name. Throws on a non-finite
  or non-positive duration and, when it throws, leaves the current state completely unchanged.
  On success, behaves like `reset()` using the new durations.
- `destroy()` — clears any pending interval/timeout so nothing keeps running after teardown.
- On completing a phase, calls `onComplete(event)` exactly once with
  `{ completedMode, mode, state }`, where `completedMode` is the mode that just finished, `mode`
  is the newly active mode, and `state` is the post-transition result of `getState()`.

`mountPomodoro(document, timerOptions)` must return `{ timer, destroy }`, where `timer` is the
live object returned by `createPomodoroTimer(...)` (not a copy or subset of it — callers rely on
calling methods directly on it) and `destroy()` removes every DOM listener `mountPomodoro` added
and also calls `timer.destroy()`. The existing bootstrap at the bottom of `app.js` already does
`globalThis.__pomodoro = mountPomodoro(document)` — do not remove or duplicate that wiring.

Wire this timer into the existing markup in `project/index.html` using its current element ids and
classes, which are load-bearing, not just styling hooks: `#mode-label`, `#time-display`,
`#start-pause`, `#reset`, `#settings`, `#work-minutes`, `#break-minutes`, `#status`, the
`.timer-card` root (toggle `data-mode` and an `is-complete` class on completion), and `#status`'s
existing `role="status"` / `aria-live="polite"` for the accessible alert.

Use exactly this required copy, since it is asserted verbatim:
- `#start-pause` button text: `"Start"` when idle, `"Pause"` while running, `"Resume"` while paused.
- On completing a work session, set `#status` text to exactly `"Work session complete. Time for a
  break."`; on completing a break, exactly `"Break complete. Ready to work."`. Also toggle
  `.timer-card`'s `is-complete` class on when a phase completes, and clear both the status text and
  `is-complete` the next time the user presses start/pause or reset.
- `#work-minutes` / `#break-minutes` are minutes; convert to seconds with `Math.round(minutes *
  60)` before calling `setDurations`. On invalid input (non-finite or non-positive minutes), leave
  the timer unchanged and set `#status` text to `"Enter positive work and break durations."`; on
  success, set it to `"Settings applied. Ready for a work session."`.

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
