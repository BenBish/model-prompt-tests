---
type: fixture
verify: bun test
verifyTimeoutMs: 30000
agentTimeoutMs: 300000
tags: typescript, feature, validation
---
# Add coupon support to cart totals

## Task

```text
Extend `totalCents` in src/cart.ts to accept an optional `couponPercent` parameter (0-100) that
applies a percentage discount to the subtotal. Totals must always be whole cents (round, don't
truncate to a fraction). Reject invalid coupon percentages (negative, over 100, or non-finite) by
throwing an error. An explicit 0 must be treated as "no discount", not skipped as a falsy value.
Run the tests to confirm your change. Do not modify the test files.
```

## Judging Guidance

- Reward validating negative, over-100, and non-finite coupon values.
- Reward rounding to whole cents rather than leaving fractional cents.
- Penalize treating `couponPercent: 0` as "no coupon" via a falsy check.

## Scoring Dimensions

- `correctness` (weight 3): Validates invalid coupon values and rounds to whole cents.
- `code-quality` (weight 2): Minimal, typed change that preserves the existing function signature for callers without a coupon.
