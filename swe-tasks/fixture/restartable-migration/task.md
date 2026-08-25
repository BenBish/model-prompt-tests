---
type: fixture
lifecycle: active
graderVersion: 1.0.0
oracleSolution: validation/reference/src
flawedSolutions: validation/flawed-a/src, validation/flawed-b/src
runtimePrerequisites: bun
verifierEnvironments: linux-bun-1.3
verify: bun test
tags: typescript, migration, restartable, backwards-compatible
---
# Make the account migration restartable
## Task
```text
Implement migrateAccounts(db, batchSize). Backfill displayName from legacy name in deterministic id order, checkpoint only after each committed batch, tolerate already-migrated rows, and enable the new read path only after all rows complete. A crash and rerun must be safe. Preserve the injected database contract.
```
## Judging Guidance
- Hidden tests inject failure between batches and inside a transaction.
- Checkpoint-before-commit skips rows; flipping the read flag early breaks old readers.
## Scoring Dimensions
- `recovery` (weight 3): Reruns after partial failure without gaps.
- `compatibility` (weight 2): Old and new schemas coexist until completion.
## Validation
Runs under 2 seconds with Bun. Holdouts inject undisclosed failure boundaries. `flawed-a` checkpoints early; `flawed-b` enables early and is not idempotent. Five stable oracle runs are required before activation.
