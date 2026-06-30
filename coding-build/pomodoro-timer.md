# Pomodoro Timer

## Prompt

```text
Build a Pomodoro timer app. It should support configurable work and break intervals, pause and resume, reset, visual alerts, and a simple responsive UI. Use plain HTML, CSS, and JavaScript unless you explain why another dependency is necessary.
```

## What This Tests

- Ability to turn product requirements into a working small app.
- State management for timer modes, pause/resume, reset, and interval changes.
- UI practicality, accessibility, and responsive design.
- Whether the model avoids unnecessary dependencies.

## Strong Answer Signals

- Produces complete runnable code with clear file boundaries or a single self-contained file.
- Handles timer state carefully without drift, duplicate intervals, or reset bugs.
- Provides usable controls, mode indicators, and visual completion alerts.
- Mentions testing steps or manually verifies key timer flows.

## Weak Answer Signals

- Omits core controls like pause/resume or reset.
- Uses fragile interval logic that creates multiple active timers.
- Builds a decorative UI without a working timer.
- Adds large frameworks without justification.

## Scoring Rubric

- `5`: Complete, runnable, responsive app with robust state handling and practical UI.
- `4`: Works well with minor UX or edge-case gaps.
- `3`: Basic timer works, but important state or responsiveness details are weak.
- `2`: Partially implemented or likely broken during normal use.
- `1`: Non-runnable, mostly conceptual, or ignores the requested stack.

## Variants

- Easier: Build only a 25-minute work timer with pause and reset.
- Harder: Add session counts, long breaks after four sessions, and persisted settings.
- Different angle: Ask for a code review of an existing Pomodoro implementation.

## Notes

This prompt is useful for comparing implementation discipline. Watch for whether models test the timer behavior instead of only styling the page.
