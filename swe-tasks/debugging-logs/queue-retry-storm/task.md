---
type: fixture
lifecycle: active
graderVersion: 1.0.0
oracleSolution: validation/reference/src
flawedSolutions: validation/unawaited-sleep/src
runtimePrerequisites: bun
verifierEnvironments: linux-bun-1.3
verify: bun test
verifyTimeoutMs: 30000
agentTimeoutMs: 300000
tags: typescript, bug-fix, debugging-logs
---
# Diagnose and fix the retry storm hitting billing-api

## Task

```text
On-call paged out for a latency spike on billing-api. Read logs/worker.log in this project - it
has the raw worker log lines from the incident plus the on-call notes at the bottom - and use it
to figure out what's actually wrong with the retry logic in src/retry.ts before you start editing.

Once you've diagnosed the root cause from the log evidence, fix src/retry.ts so that retries
actually wait for the computed backoff delay to elapse before the next attempt. Do not change the
backoff math (`backoffDelayMs`) or the public function signatures. Run the tests to confirm your
change. Do not modify the test files.
```

## Judging Guidance

- Reward correctly identifying, from the log timestamps and on-call notes, that attempts are
  firing back-to-back despite a correct backoff calculation - i.e. the delay is computed but never
  actually waited on.
- Reward a minimal, targeted fix (awaiting the sleep call) over a rewrite of the retry loop.
- Penalize "fixes" that only mask the symptom, such as increasing `baseDelayMs` or adding jitter,
  without addressing why the computed delay isn't elapsing.

## Scoring Dimensions

- `correctness` (weight 3): Retries genuinely wait for the full backoff delay before the next attempt.
- `root-cause-diagnosis` (weight 3): The fix targets the actual defect (an unawaited async call), not just a surface symptom.

## Validation

Runs under 2 seconds with Bun. The reference solution awaits the sleep call before looping;
`unawaited-sleep` doubles the base delay (masking the symptom in casual testing) but still never
awaits it, so it passes the visible tests but fails the hidden test that blocks the backoff
promise and asserts no second attempt happens before it resolves.
