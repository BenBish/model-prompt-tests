---
type: external
repoUrl: ./source.bundle
commitSha: 7cb0d9ff20569dd744318639ca0621be2b2671a2
verify: bun test
verifyTimeoutMs: 30000
agentTimeoutMs: 300000
testPaths: tests/add.test.ts
holdoutPatch: holdout.patch
tags: external, typescript, smoke
---
# Fix the add function (external seed)

## Task

```text
This repository has a tiny `add` helper in src/add.ts that returns the wrong result.
Fix it so all tests pass. Do not weaken or delete tests.
```

## Judging Guidance

- Reward a minimal one-line fix that restores addition.
- Penalize rewriting the project or changing the test suite.

## Scoring Dimensions

- `correctness` (weight 3): add(a, b) returns a + b for general inputs.
- `code-quality` (weight 2): Minimal, idiomatic change confined to src/add.ts.
