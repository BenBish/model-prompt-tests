---
type: fixture
lifecycle: active
graderVersion: 1.0.0
oracleSolution: validation/reference/src
flawedSolutions: validation/flawed-a/src, validation/flawed-b/src
runtimePrerequisites: bun
verifierEnvironments: linux-bun-1.3
verify: bun test
tags: typescript, cache, concurrency, injected-clock
---
# Repair TTL cache stampede behavior
## Task
```text
Implement AsyncCache.get(key, loader) with the injected millisecond clock. Cache values until ttlMs expires, coalesce parallel loads per key, and never cache rejected loads. Preserve constructor and method signatures.
```
## Judging Guidance
- Hidden tests control time exactly, exercise key isolation, and call expired keys concurrently.
- Sliding TTL and caching promises after rejection are incorrect.
## Scoring Dimensions
- `ttl` (weight 2): Uses insertion time and injected clock correctly.
- `stampede` (weight 3): Coalesces only same-key in-flight work.
## Validation
Runs under 2 seconds with Bun. Holdouts are isolated. `flawed-a` stampedes; `flawed-b` uses wall time and retains rejection. Five stable oracle runs precede activation; randomized keys lower contamination risk.
