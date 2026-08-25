---
type: fixture
lifecycle: active
graderVersion: 1.0.0
oracleSolution: validation/reference/src
flawedSolutions: validation/flawed-a/src, validation/flawed-b/src
runtimePrerequisites: bun
verifierEnvironments: linux-bun-1.3
verify: bun test
tags: typescript, frontend, autosave, race
---
# Prevent stale autosave responses
## Task
```text
Implement createAutosave(save, onStatus). Each edit starts a save; only the latest edit may update visible status. Earlier requests may resolve or reject later. flush() waits for all work, and destroy() prevents later callbacks. Keep the public API edit(value), flush(), destroy().
```
## Judging Guidance
- Hidden tests resolve deferred requests out of order and destroy with requests pending.
- Serializing every request avoids the race but violates expected latest-edit throughput.
## Scoring Dimensions
- `ordering` (weight 3): Stale responses cannot overwrite latest state.
- `lifecycle` (weight 2): Flush and teardown are deterministic.
## Validation
Runs under 2 seconds with Bun. Holdout settlement order is undisclosed. `flawed-a` accepts stale completion; `flawed-b` serializes edits and violates latest-edit throughput. Five stable oracle runs precede activation.
