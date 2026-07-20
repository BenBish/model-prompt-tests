---
type: code-review
agentTimeoutMs: 180000
tags: code-review, security, auth
---
# Senior PR review: auth login compare

## Task

```text
Review this pull request as a senior engineer. Focus on security, correctness, and maintainability. Lead with findings ordered by severity. Do not rewrite everything unless necessary.
```

## Judging Guidance

- Reward detecting plaintext-style password compare and timing/user-enumeration issues.
- Penalize approving the change or focusing only on style.

## Scoring Dimensions

- `security-risk-detection` (weight 3): Flags unsafe password handling and timing/enumeration issues.
- `prioritization` (weight 2): Leads with high-severity security findings first.
- `actionability` (weight 1): Suggests concrete safer patterns (hash verify API, uniform errors).
