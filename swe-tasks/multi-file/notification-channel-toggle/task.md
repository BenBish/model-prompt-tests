---
type: fixture
lifecycle: active
graderVersion: 1.0.0
oracleSolution: validation/reference/src
flawedSolutions: validation/missing-dispatch/src
runtimePrerequisites: bun
verifierEnvironments: linux-bun-1.3
verify: bun test
verifyTimeoutMs: 30000
agentTimeoutMs: 300000
tags: typescript, feature, multi-file
---
# Add an SMS notification channel

## Task

```text
This notification system currently supports "email" and "push" channels across three files:
`src/types.ts` (the `Channel` union and shared interfaces), `src/preferences.ts` (validates and
normalizes which channels a user may enable), and `src/notifier.ts` (dispatches a message to each
enabled channel).

Add a new "sms" channel so it works end to end: a preferences object with `channels: ["sms"]`
must normalize successfully (not be filtered out as unknown), and dispatching a message to it must
route through a new SMS sender rather than throwing "unsupported channel". Channels that are
genuinely unknown (e.g. "fax") must still be rejected/dropped exactly as before. Run the tests to
confirm your change. Do not modify the test files.
```

## Judging Guidance

- Reward changes that touch all three files consistently: the type union, the allowlist in
  preferences, and the dispatch switch in the notifier.
- Penalize a partial edit that makes "sms" pass validation but still throws "unsupported channel"
  when dispatched, or vice versa.
- Penalize accidentally accepting channels that were never asked for (e.g. loosening validation to
  accept any string).

## Scoring Dimensions

- `correctness` (weight 3): "sms" normalizes and dispatches successfully; other unknown channels are still rejected.
- `code-quality` (weight 2): Follows the existing per-channel branching style instead of introducing an unrelated abstraction.

## Validation

Runs under 2 seconds with Bun. The reference solution updates all three files; `missing-dispatch`
updates the type and the allowlist but leaves the notifier's dispatch switch untouched, so it
passes the visible email/push tests but fails the hidden end-to-end sms dispatch test.
