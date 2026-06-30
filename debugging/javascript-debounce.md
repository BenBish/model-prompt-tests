# JavaScript Debounce Debugging

## Prompt

```text
This function is supposed to debounce user input, but it sometimes fires more than once. Explain what is wrong and rewrite it safely.

function debounce(fn, delay) {
  let timeout;
  return function() {
    setTimeout(() => fn.apply(this, arguments), delay);
  }
}
```

## What This Tests

- JavaScript closure and timer reasoning.
- Ability to explain a bug before patching it.
- Preservation of `this` and arguments.
- Concise, correct code repair.

## Strong Answer Signals

- Identifies that `timeout` is never used to clear prior scheduled calls.
- Uses `clearTimeout(timeout)` before assigning a new timeout.
- Preserves call context and arguments safely.
- Notes optional choices like returning the function result are not meaningful for delayed calls.

## Weak Answer Signals

- Focuses only on syntax or style.
- Rewrites the function into throttle behavior.
- Loses `this` binding or arguments.
- Claims `let timeout` is the bug without explaining missing cancellation.

## Scoring Rubric

- `5`: Correct diagnosis, clear explanation, and robust replacement.
- `4`: Correct fix with minor explanation gaps.
- `3`: Fix is mostly right but misses context or argument handling.
- `2`: Misdiagnoses the behavior or creates a different utility.
- `1`: Broken code or no meaningful bug explanation.

## Variants

- Easier: Ask only for the corrected debounce function.
- Harder: Add leading-edge and trailing-edge options.
- Different angle: Ask for tests that prove the original function is broken.

## Notes

This prompt catches models that produce plausible JavaScript without actually reasoning about timers.
