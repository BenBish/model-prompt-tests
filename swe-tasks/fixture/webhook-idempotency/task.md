---
type: fixture
lifecycle: active
graderVersion: 1.0.0
oracleSolution: validation/reference/src
flawedSolutions: validation/flawed-a/src, validation/flawed-b/src
runtimePrerequisites: bun
verifierEnvironments: linux-bun-1.3
verify: bun test
tags: typescript, concurrency, idempotency
---
# Make webhook delivery idempotent under concurrency
## Task
```text
Implement createWebhookHandler so duplicate deliveries, including concurrent calls, apply an event exactly once. Failed effects must be retryable. Keep the injected store/effect API and do not modify tests.
```
## Judging Guidance
- Hidden tests release parallel callers simultaneously and retry after an effect rejection.
- Marking before the effect loses retries; check-then-set races duplicate effects.
## Scoring Dimensions
- `concurrency` (weight 3): Coalesces concurrent duplicate deliveries.
- `recovery` (weight 2): Failure does not permanently consume an event.
## Validation
Runs under 2 seconds with Bun. Hidden tests are overlaid after candidate work. `flawed-a` races; `flawed-b` loses failed deliveries. Inputs are generated to reduce contamination. Five stable oracle runs are required before activation.
