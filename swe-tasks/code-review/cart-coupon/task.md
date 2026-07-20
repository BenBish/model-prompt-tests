---
type: code-review
agentTimeoutMs: 180000
tags: code-review, money, validation
---
# Senior PR review: cart coupon

## Task

```text
Review this pull request as a senior engineer. Focus on correctness, edge cases, maintainability, and missing tests. Lead with findings ordered by severity. Do not rewrite everything unless necessary.
```

## Judging Guidance

- Reward finding money precision / fractional cents and missing coupon validation.
- Reward severity ordering and targeted test suggestions.
- Penalize pure diff summaries and cosmetic-only nits.

## Scoring Dimensions

- `correctness-risk-detection` (weight 3): Flags fractional cents and missing coupon validation (negative, over-100, non-finite).
- `prioritization` (weight 2): Leads with findings ordered by severity rather than a diff summary.
- `test-thinking` (weight 2): Suggests focused tests for rounding and invalid coupon inputs.
