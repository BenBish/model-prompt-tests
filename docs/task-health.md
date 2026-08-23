# Benchmark task health

SWE evidence is publishable only when its grader is known healthy in the verifier environment that produced it. Task frontmatter records the lifecycle (`draft`, `validated`, `active`, `quarantined`, or `retired`), grader version, prerequisites, supported environments, an oracle solution, and intentionally flawed solutions.

Run `bun bench/src/cli.ts swe health all` before a benchmark. For every active task the command runs the oracle five times, requires a stable test count and 100% pass rate, and confirms each flawed solution is rejected. The resulting record is keyed by task, grader version, and an OS/runtime fingerprint. A healthy laptop record therefore does not authorize a Fedora/Halo run; Fedora must validate independently (or use a pinned verifier-equivalent container).

`swe run` blocks draft, quarantined, retired, unhealthy, stale-version, and environment-mismatched tasks before candidates consume capacity. Missing prerequisites are infrastructure failures: they produce no model verdict and should be retried after the verifier is repaired.

SWE rows carry grader/environment health metadata and a publication status. Reports exclude quarantined rows from summaries. The migration deliberately marks pre-health-record historical SWE rows `quarantined`; their raw evidence remains in SQLite, but it is non-comparable instead of being silently rewritten.

## BSH-222 baseline diagnosis

On 2026-08-23, current `main` passed all 370 deterministic tests. The Pomodoro reference and independent contract-following implementations both passed the same 9-test verifier, the intentionally decrement-per-tick implementation failed the intended elapsed-time and duplicate-interval checks, and the subprocess stdin contract passed. The reported failures were historical/already repaired rather than reproducible at this revision. Grader `2.0.0` records the now-stable contract; older Pomodoro evidence is non-comparable unless its exact grader/environment is independently validated.
