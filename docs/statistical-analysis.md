# Statistical analysis and interpretation

Benchmark reports treat tasks as the unit of comparison. They do not flatten repeated trials or unrelated ordinal rubric dimensions into independent observations.

## Definitions

- Binary model rates include candidate failures, invalid outputs, and timeouts in the intention-to-evaluate denominator. Harness, verifier, and judge infrastructure failures are excluded from the candidate denominator and counted separately.
- Each binary rate uses a 95% Wilson score interval.
- Pairwise deltas use only tasks observed for both models. Each task contributes equally. Repeated trials are averaged within task, and uncertainty uses a deterministic hierarchical bootstrap: resample tasks with replacement, then resample repeats within each selected task.
- The default practical-equivalence threshold is 2 percentage points. `win` requires the entire 95% interval above +2 points; `loss` requires it below -2 points. Otherwise the result is `inconclusive`. At least five matched tasks and 80% matched coverage are required. These settings are configurable through the analysis API.
- `invalid-infrastructure` means no usable matched evidence exists and infrastructure failures prevented analysis.
- Task effects remain in summary JSON so aggregate claims can be audited.

## Coverage and warnings

Reports include task coverage, missing task count, judge coverage, infrastructure failures, ceiling/floor concentration, and bootstrap top-rank probability. They warn about low sample size, low paired coverage, more than ten pairwise comparisons, ceiling/floor concentration, and top-rank probability below 80%.

Judge scores are secondary ordinal signals. They are not pooled across unrelated rubric dimensions without a predeclared suite weighting policy. The shared API accepts explicit paired preference outcomes (`baseline`, `candidate`, or `tie`) and reports decisive win rate, tie rate, and position-swap metadata coverage. The current storage schema does not capture those fields for every judge call, so report generation leaves preference analysis unavailable instead of inferring it from unrelated 1–5 rubric scores.

## Domains and staged decisions

Quality/correctness evidence may be compared across execution domains only when experiment semantics are compatible; the report labels cross-domain results exploratory. Latency, throughput, memory, energy, and reliability require the same compatible Fedora environment for Halo production decisions. Environment fingerprints are included in comparison JSON.

Time-budgeted or sequential decisions must predeclare stages and allocate error (for example, alpha spending) before data collection. Repeatedly inspecting the ordinary 95% interval and stopping on a favorable result inflates false-win rates and is not supported as a valid win rule.
