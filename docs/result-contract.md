# Versioned result contract (BSH-223)

A cross-repository consumer such as Halo-Maxxing must never read `bench/data/bench.sqlite`
directly, re-derive aggregation formulas, or regex a batch id out of human-readable stdout.
This is the stable interface instead. It is additive to, not a replacement for, the
[experiment manifest contract](experiment-manifests.md) and the
[statistical analysis layer](statistical-analysis.md) — it composes both rather than
re-deriving them, so a contract consumer never disagrees with `bun bench/src/cli.ts report`.

## Obtaining a batch/experiment identity without parsing stdout

`run`, `swe run`, and `hermes tools` all accept `--summary-out <path>`, which writes
`{ schemaVersion: 1, runBatchId, experimentId }` as JSON to that path once the command
completes — in addition to (not instead of) their existing human-readable stdout. A consumer
that needs the durable identity reads this file, never stdout.

## Fetching the contract

```
bun bench/src/cli.ts experiment export --batch <id1> [--batch <id2> ...] --model <model_id> [--kind swe|prompt|tool-probe] [--out <path>]
```

Prints (or writes to `--out`) a `ResultContract` (see `bench/src/contract/resultContract.ts`):

The command fails with a non-zero exit code when the requested batch/model/kind has no
matching evidence. Missing coverage is never represented as a successful zero-run contract,
so consumers cannot mistake a stale identifier or model-id typo for a benchmark result.

| Field | Meaning |
|---|---|
| `schemaVersion` | Bump whenever a field is removed or its meaning changes. A consumer must reject a version it does not understand rather than guess. |
| `experimentId` / `manifestHash` | The content-addressed experiment id (same value; `manifestHash` is included under the name the acceptance criteria use). Undefined when `legacy` is true. |
| `environmentFingerprint` | The manifest's environment fingerprint — execution domain, host, accelerator, etc. Undefined for legacy batches. |
| `legacy` | True when the batch predates experiment provenance (BSH-220) and cannot be rehydrated. A legacy batch remains viewable but has no manifest, no environment fingerprint, and no cross-domain safety guarantees. |
| `health` | Task-health status for `kind: "swe"` (`healthy`, `unhealthy`, `infrastructure-failure`, `unvalidated`, `unknown`), derived from the same `swe_results.health_status` rows the health-gate system (BSH-222) already writes. Always `"not-applicable"` for `kind: "prompt"` — prompt suites have no task-health concept. |
| `outcomeCounts` | Per-run outcome counts. SWE categories are `passed`, `candidate_failure`, `timeout`, `invalid_output`, `harness_error`, `verifier_error`, and `judge_error`. Prompt categories are `passed`, `candidate_failure`, `timeout`, `rate_limit`, `provider_error`, `connection_error`, and `harness_error`. Prompt `timeout`, `rate_limit`, `provider_error`, `connection_error`, and `harness_error` are infrastructure failures; empty or malformed model-produced responses are `candidate_failure`. Legacy rows without a category appear as `unknown`. A consumer must never fold infrastructure errors into a candidate loss. |
| `metrics.primary` | The one number a verdict should compare against a baseline's — `intentionToEvaluatePassRate` for SWE (with a Wilson interval — a *single arm's own* rate, not matched against a specific baseline), `avgScore` for prompt suites (no interval; use the paired contract below for uncertainty against a specific baseline). Undefined when nothing reached evaluation. |
| `metrics.secondary` | Everything else (latency, throughput, timeouts, infra-failure counts) a report or verdict may want, by name. Prompt contracts include `infrastructureFailures` and `candidateFailures`; these aggregate the prompt categories described above and are zero when the selected model has no failures of that class. `taskCoverage`/`judgeCoverage` (BSH-361) are the statistics layer's own coverage fractions for this model within the requested batch(es) — undefined only when the model has literally no rows to compute a denominator from (which `experiment export` already fails closed on), never coerced to zero for a measurement that merely didn't run. |
| `artifacts.runBatchId` | The batch id, for cross-referencing exports/reports produced by other bench commands. |
| `runBatchIds` / `artifacts.runBatchIds` | Present only for a multi-batch export and lists every contributing batch in command-line order. The singular fields remain the first batch for schema-v1 compatibility. |

## Resumed suites and repeated batches

Create later batches with the original frozen experiment id as described in
[Resuming a frozen suite](experiment-manifests.md#resuming-a-frozen-suite). A narrower selector
without `--experiment <original-experiment-id>` mints a different subset manifest and cannot be
composed with the first batch.

Repeated `--batch` flags compose a cell set rather than concatenating rows. A prompt cell is
`(promptId, modelId, repeatIndex)`, a SWE cell is `(taskId, harnessModelId, repeatIndex)`, and a
tool-probe cell is `(caseId, modelId, repeatIndex)`. Missing cells stay missing. When batches
overlap, a completed comparable row replaces an interrupted, errored, or quarantined row for
the same cell. Two completed comparable rows for one cell are ambiguous and make export fail.

Every selected batch must contain evidence for the requested model and kind. Legacy batches
may be composed only with other legacy batches; they cannot be mixed with manifest-bearing
batches. Manifest-bearing batches must be semantically compatible according to
`compareExperiments()`. Environment differences are permitted for a quality-only contract,
but fail export whenever the resulting contract includes latency or throughput metrics.
Aggregation is still performed by the normal report/statistics/health code over the selected
union; the contract layer does not invent missing zeros or duplicate report formulas.

## Paired candidate-vs-baseline comparison (BSH-361)

`experiment export` reports each model's own point estimate in isolation — a Wilson interval on
*its own* rate, computed independently of whatever it will be compared against. That is not the
same question as "is this candidate actually better than this specific baseline, accounting for
the fact both were measured on the same tasks." The latter is a matched-task (paired) question,
and the statistics layer (`report/statistics.ts`) has computed it with a hierarchical bootstrap
— resampling tasks, then repeats within each task — since BSH-221. `experiment export` never
surfaced it. This command does:

```
bun bench/src/cli.ts experiment compare-paired \
  --batch <candidate_batch> --model <candidate_model_id> \
  --baseline-batch <baseline_batch> --baseline-model <baseline_model_id> \
  [--kind swe|prompt] [--practical-equivalence <n>] [--out <path>]
```

Prints (or writes to `--out`) a `PairedResultContract` (see `bench/src/contract/pairedContract.ts`):

| Field | Meaning |
|---|---|
| `schemaVersion` | `PAIRED_CONTRACT_VERSION`, versioned independently of `RESULT_CONTRACT_VERSION` — this is a different contract, not an extension of the single-arm one. |
| `candidate` / `baseline` | Each arm's `modelId`, `runBatchId`, `totalRuns`, `okRuns`, and coverage (`taskCoveragePct`/`judgeCoveragePct`, as percentages, `undefined` — never zero — when not computable or not applicable to the kind). |
| `compatibility.status` | `"compatible"` or `"incompatible"` when both arms have an experiment manifest (via `compareExperiments()` — the same check used for composing one model across batches), `"unknown"` when either arm is a legacy batch. **`"unknown"` is never treated as compatible.** |
| `compatibility.differences` | The differing manifest paths (`tasks`, `judges`, `harness`, `prompts`, `limits`, `toolPermissions`, `models`, `environment`) when incompatible — this is the baseline-invalidation signal: a task, grader, harness/runtime, template, quant, or serving-setting change shows up here by name. |
| `comparison` | A `PairedComparison` (see `statistical-analysis.md`): `matchedTasks`, `unionTasks`, `coverage`, `delta`, `interval` (hierarchical-bootstrap, on the metric's own scale — a 0–1 rate delta for SWE, a raw score delta for prompt), `verdict` (`win`/`loss`/`inconclusive`/`invalid-infrastructure`), `taskEffects`, `warnings`. |

Compatibility is enforced before the verdict is trusted: an incompatible or unknown-compatibility
pair always reports `comparison.verdict: "inconclusive"` regardless of what the bootstrap interval
says, with a warning naming why. A consumer must never override that suppression.

For `kind: "prompt"`, the comparison runs on raw judge scores (via the new `pairedScoreComparison`
primitive), not a binarized pass/fail — `--practical-equivalence` should be set to the same
minimum-meaningful-score-delta a report already uses (it defaults to `0.02`, tuned for 0–1 rates,
not a 1–5 score scale).

This command intentionally takes exactly one candidate batch/model and one baseline batch/model —
unlike `experiment export`, it does not compose multiple batches per arm. A candidate whose own
evidence spans multiple nights should be exported and judged for internal completeness with
`experiment export` first; pair only a single, already-decided batch against the baseline.

## Ownership boundary

`model-prompt-tests` is the source of truth for trials, scores, manifests, health evidence,
and statistical summaries — the contract is a read-only projection of that data. It does not
grant write access to the benchmark database, and a consumer must never insert directly into
`bench/data/bench.sqlite`.
