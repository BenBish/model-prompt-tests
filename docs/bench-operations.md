# Benchmark operations

The automation has three execution domains. `generic-ci` owns deterministic pull-request checks and scheduled oracle/calibration health. `omarchy-laptop` is an explicitly initiated laptop experiment and must not be presented as Fedora performance. `fedora-production-slot` is an evaluation-engine invocation inside a lease supplied by Halo-Maxxing.

Halo-Maxxing alone owns the Fedora 02:00–06:00 production window, slot locks, model stop/restore, dead-man recovery, candidate discovery, and win notifications. This repository never schedules that window or acquires/restores its resources. A Fedora contract without an unexpired Halo lease token is rejected. Interrupted, timed-out, or over-budget Fedora work is `invalid/inconclusive`, never an automatic candidate loss, and control returns to Halo.

## Local and CI commands

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
bun run bench swe health all
bun run bench calibrate --anchors bench/calibration/anchors-v1.json --evidence bench/calibration/reference-evidence-v1.json --out /tmp/calibration.json
bun run ops validate-contract --contract bench/ops/nightly-contract.json
bun run ops gate --policy policy.json --evidence evidence.json --out result.json
```

Pull requests require only CPU/Bun/SQLite. Provider keys, network calls, GPUs, and either physical host are excluded. The scheduled health workflow uses pinned committed calibration inputs and has no provider secrets. Opt-in model workflows should store provider credentials as GitHub Actions secrets, set `BENCH_EXECUTION_DOMAIN`, validate a committed contract before calls, and upload the contract, manifest, partial results, policy output, and logs even on failure.

Budgets are hard ceilings for model calls, tokens, dollars, elapsed time, and concurrency. A runner must checkpoint each completed cell by its deterministic cell key. On resume it skips completed keys, so interruption cannot duplicate cells. Budget exhaustion stops new calls but preserves the partial experiment and produces an inconclusive verdict.

## Regression and publication policy

`ops gate` consumes versioned JSON policy/evidence and exits 0 only for a pass (2 for regression, 3 for incomplete evidence). It evaluates correctness, error and timeout rates, cost, latency, coverage, grader health, and paired deltas with a minimum sample size and uncertainty bound. Notifications should include affected tasks, effect size/confidence, infrastructure health, the immutable candidate/baseline ids, and artifact/report links. Ordinary variance or incomplete infrastructure evidence is inconclusive, not an alert-worthy loss.

Export remains fail-closed on judge calibration, immutable experiment provenance, model identity, and quarantined task evidence. Baselines are `exp_` ids. Promotion is an explicit append-only audit event:

```sh
bun run ops promote-baseline --audit bench/ops/baselines.jsonl --suite nightly-v1 --experiment exp_... --actor "$USER" --reason "paired improvement approved in PR #123"
```

Review that audit change like code. Never edit an earlier line or use a mutable batch name as a baseline.

## Failure triage

1. Download the workflow artifact and identify whether the failure is deterministic, infrastructure, policy regression, or incomplete evidence.
2. For oracle/grader failures, quarantine affected evidence and repair/validate the task before rerunning candidates.
3. For provider or budget failures, resume the same experiment/cell checkpoint; do not create duplicate cells.
4. For Fedora failures, leave production recovery to Halo and report the lease token identifier, affected cells, partial manifest, and `invalid/inconclusive` verdict.
5. Promote or notify a win only after compatible manifests and a statistically meaningful paired result pass every gate.
