---
type: code-review
lifecycle: draft
graderVersion: 1.0.0
agentTimeoutMs: 300000
tags: code-review, transaction, security, observability, multi-file
---
# Review checkout transaction hardening
## Task
```text
Review this multi-file pull request as a senior engineer. Focus on correctness, security, transaction boundaries, and production observability. Lead with severity-ordered findings and distinguish blockers from optional cleanup.
```
## Judging Guidance
- Ground truth includes a cross-tenant ownership bypass, an external call inside a retryable transaction, swallowed rollback failure, and missing correlation context.
- Do not reward plausible style-only red herrings.
## Scoring Dimensions
- `critical-security` (weight 4): Finds the tenant ownership bypass.
- `transaction-correctness` (weight 3): Finds duplicate charge and rollback risks.
- `observability` (weight 2): Finds loss of correlation context without inventing blockers.
- `prioritization` (weight 2): Separates blockers from red herrings.

## Validation
Review-only task; expected runtime under five minutes. Findings are severity weighted and path anchored. Red herrings exercise reviewer precision. The diff and grader revision are immutable in experiment manifests. Activation requires three-model calibration and acceptable discrimination/flake evidence.
