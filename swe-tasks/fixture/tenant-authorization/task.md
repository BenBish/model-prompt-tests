---
type: fixture
lifecycle: active
graderVersion: 1.0.0
oracleSolution: validation/reference/src
flawedSolutions: validation/route-only/src, validation/repository-only/src
runtimePrerequisites: bun
verifierEnvironments: linux-bun-1.3
verify: bun test
tags: typescript, authorization, multi-tenant, multi-file
---
# Repair cross-tenant document authorization

## Task

```text
Repair the document read path so users can only read documents in their tenant. Preserve the route, service, and repository boundaries. Missing and unauthorized documents must both return 404, and repository queries must be tenant-scoped. Do not modify tests.
```

## Judging Guidance

- Hidden tests use colliding ids and require tenant scope at every layer.
- Route-only checks leak data across the repository boundary.

## Scoring Dimensions

- `authorization` (weight 3): Prevents cross-tenant reads.
- `layering` (weight 2): Carries tenant identity through all layers.

## Validation

Runtime is under 2 seconds with Bun. Holdout tests are overlaid after candidate execution. `route-only` fails repository scope; `repository-only` trusts caller-controlled input. Low contamination risk: holdout tenant collisions are undisclosed. Five stable oracle runs are required before activation.
