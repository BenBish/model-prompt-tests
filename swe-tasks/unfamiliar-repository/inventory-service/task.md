---
type: fixture
lifecycle: active
graderVersion: 1.0.0
oracleSolution: validation/reference/src
flawedSolutions: validation/no-sufficiency-check/src
runtimePrerequisites: bun
verifierEnvironments: linux-bun-1.3
verify: bun test
verifyTimeoutMs: 30000
agentTimeoutMs: 300000
tags: typescript, feature, unfamiliar-repository
---
# Add stock reservation to the inventory service

## Task

```text
This is an inventory service you haven't seen before, laid out as routes -> services ->
repositories -> utils under src/. Explore it before changing anything - nothing below tells you
which file currently owns stock mutations.

Add a "reserve stock" capability with these requirements:
- A caller can reserve `amount` units of a `sku`. On success, `amount` moves from that sku's
  available count to its reserved count (available -= amount, reserved += amount).
- If `amount` is greater than the current available count, the reservation must fail (throw) and
  leave the stock record completely unchanged - no partial reservation.
- The new capability must be reachable the same way the existing restock/availability operations
  are reachable from outside this module, following the same layering those already use (a mutation
  should still go through the repository, not bypass it).
- Expose it as `reserveStock(sku, amount)` returning `{ available, reserved }`, and as a route
  handler named `handleReserve(sku, amount)` returning `{ sku, available, reserved }`.

Run the tests to confirm your change. Do not modify the test files.
```

## Judging Guidance

- Reward correctly locating the existing repository/service/route layering before writing new
  code, rather than reimplementing storage access in a new place.
- Reward enforcing the insufficient-stock check as an all-or-nothing guard (no mutation on failure).
- Penalize a reservation that silently clamps to zero available stock instead of rejecting the
  request when there isn't enough to reserve.

## Scoring Dimensions

- `correctness` (weight 3): Insufficient reservations are rejected atomically; successful ones correctly move available -> reserved.
- `codebase-navigation` (weight 3): New logic lives in the correct layer (service mutates via the repository; the route only translates to/from the service) instead of a fresh ad hoc path.

## Validation

Runs under 2 seconds with Bun. The reference solution adds `reserveStock` to
`services/inventoryService.ts` and `handleReserve` to `routes/inventory.ts`, both going through the
existing repository. `no-sufficiency-check` implements the same call graph but clamps to zero
instead of rejecting an over-large reservation, so it passes the visible restock/availability
regression tests but fails the hidden tests for over-reservation and exact-remaining-stock
reservation.
