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
| `metrics.primary` | The one number a verdict should compare against a baseline's — `intentionToEvaluatePassRate` for SWE (with a Wilson interval from the paired-trial statistics layer), `avgScore` for prompt suites (no interval yet; prompt suites are not wired into the statistics layer — tracked as a follow-up). Undefined when nothing reached evaluation. |
| `metrics.secondary` | Everything else (latency, throughput, timeouts, infra-failure counts) a report or verdict may want, by name. Prompt contracts include `infrastructureFailures` and `candidateFailures`; these aggregate the prompt categories described above and are zero when the selected model has no failures of that class. |
| `artifacts.runBatchId` | The batch id, for cross-referencing exports/reports produced by other bench commands. |
| `runBatchIds` / `artifacts.runBatchIds` | Present only for a multi-batch export and lists every contributing batch in command-line order. The singular fields remain the first batch for schema-v1 compatibility. |

## Resumed suites and repeated batches

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

## Ownership boundary

`model-prompt-tests` is the source of truth for trials, scores, manifests, health evidence,
and statistical summaries — the contract is a read-only projection of that data. It does not
grant write access to the benchmark database, and a consumer must never insert directly into
`bench/data/bench.sqlite`.
