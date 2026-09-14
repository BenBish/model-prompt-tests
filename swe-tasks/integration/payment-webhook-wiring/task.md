---
type: fixture
lifecycle: active
graderVersion: 1.0.0
oracleSolution: validation/reference/src
flawedSolutions: validation/throws-on-unknown-type/src
runtimePrerequisites: bun
verifierEnvironments: linux-bun-1.3
verify: bun test
verifyTimeoutMs: 30000
agentTimeoutMs: 300000
tags: typescript, integration
---
# Wire payment gateway webhooks to order status updates

## Task

```text
Two independent, already-tested pieces exist in this project:

- `src/paymentGateway.ts` - parses a raw webhook body into a `GatewayEvent { type, orderId }`.
  Do not modify it.
- `src/orderService.ts` - tracks each order's status and exposes `markPaid`, `markFailed`, and
  `markRefunded`. Do not modify it.

Implement `src/webhookHandler.ts`'s `handleWebhook(rawBody: string): void` to connect them:
parse the raw body with the gateway client, then call the matching order service function:
"payment.succeeded" -> markPaid, "payment.failed" -> markFailed, "payment.refunded" ->
markRefunded. The payment provider adds new event types over time, so any event type this handler
doesn't recognize must be silently ignored (no throw, no status change) rather than treated as an
error - a thrown error here causes the provider to retry the webhook indefinitely.

Run the tests to confirm your change. Do not modify the test files or the two existing modules.
```

## Judging Guidance

- Reward calling the existing `parseEvent` and `markPaid`/`markFailed`/`markRefunded` functions
  directly rather than reimplementing parsing or status storage inside the handler.
- Reward correctly no-op'ing on an unrecognized event type.
- Penalize throwing (or otherwise erroring) on an unrecognized event type - that is the specific
  behavior this integration point must not have.

## Scoring Dimensions

- `correctness` (weight 3): Each known event type reaches the correct order service call, and unknown types are ignored without throwing.
- `integration-hygiene` (weight 2): Reuses the two existing modules as-is instead of duplicating or modifying their logic.

## Validation

Runs under 2 seconds with Bun. The reference solution's `default` case in the event-type switch is
a no-op; `throws-on-unknown-type` maps the three known event types identically but throws for
anything else, so it passes the visible regression tests for the two untouched modules but fails
the hidden test asserting an unrecognized event type does not throw.
