---
type: external
lifecycle: draft
graderVersion: 1.0.0
repoUrl: https://github.com/sindresorhus/p-limit.git
commitSha: df476048d023ff868cd45b35ee47f5fb0ca2b25a
verify: npx ava test.js test-abort.js
verifyTimeoutMs: 120000
agentTimeoutMs: 600000
testPaths: test.js
holdoutPatch: holdout.patch
oracleSolution: validation/reference.patch
flawedSolutions: validation/flawed-listener-leak.patch, validation/flawed-queued-only.patch
runtimePrerequisites: node, npm, git
verifierEnvironments: linux-bun-1.3
tags: external, javascript, concurrency, abort-signal, oss
---
# Add abortable queued work to p-limit
## Task
```text
Add an optional AbortSignal to queued p-limit work while preserving the package's existing API and concurrency behavior. Aborting before execution must remove and reject only that item; aborting after execution starts must not corrupt activeCount or pendingCount. Clean up listeners in every settlement path and preserve FIFO order for unaffected work. Do not weaken tests.
```
## Judging Guidance
- Holdouts cover pre-aborted signals, queue removal, listener cleanup, and abort/start races.
- A clearQueue-only implementation strands promises; racing without once/cleanup leaks listeners.
## Scoring Dimensions
- `correctness` (weight 3): Abort semantics preserve counters and FIFO scheduling.
- `resource-safety` (weight 2): Listeners and queued closures are released.
- `compatibility` (weight 2): Existing p-limit API and tests remain valid.

## Validation
Pinned upstream OSS repository with immutable commit and patch revisions recorded by the experiment manifest. Expected runtime under two minutes with Node/npm/git. Holdout paths are applied only in the verifier. Reference and two independent flawed patches document expected signals. Keep draft until five stable verifier runs and three-model calibration demonstrate discrimination. Contamination risk is medium because the upstream project is public; the regression and holdout race schedule are synthetic.
