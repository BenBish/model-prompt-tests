---
type: fixture
verify: bun test
verifyTimeoutMs: 30000
agentTimeoutMs: 120000
tags: smoke, typescript
---
# Fix the add function

## Task

```text
The `add` function in src/add.ts returns the wrong result. Find the bug and fix it so all tests
pass. Do not modify the test files.
```

## Judging Guidance

- Reward a minimal, correct fix confined to src/add.ts.
- Penalize special-casing specific input values instead of fixing the general bug.

## Scoring Dimensions

- `code-quality` (weight 3): Fix is minimal, idiomatic, and confined to src/add.ts.
- `generality` (weight 2): Fix works for all inputs, not just the values exercised by the visible test.
