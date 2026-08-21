/**
 * Reads llama.cpp's Prometheus `/metrics` endpoint (enabled via `--metrics`) to measure true
 * server-side decode/prefill throughput, independent of harness-reported token counts (which
 * are frequently absent for generic-cli/omp-style harnesses and for any run that times out).
 *
 * Counters are cumulative for the life of the server process, so callers sample before and
 * after a cell and diff. This is only safe when the sampled server is exclusive to one cell at
 * a time (no concurrent slots serving other cells) — true for every local benchmarking window
 * in this repo, which stops competing services first.
 */

export interface LlamaCppMetricsSnapshot {
  promptTokensTotal?: number;
  promptSecondsTotal?: number;
  predictedTokensTotal?: number;
  predictedSecondsTotal?: number;
}

export interface LlamaCppMetricsDelta {
  promptTokens?: number;
  promptSeconds?: number;
  predictedTokens?: number;
  predictedSeconds?: number;
}

const METRIC_PATTERNS: Record<keyof LlamaCppMetricsSnapshot, RegExp> = {
  promptTokensTotal: /^llamacpp:prompt_tokens_total\s+([0-9.eE+-]+)/m,
  promptSecondsTotal: /^llamacpp:prompt_seconds_total\s+([0-9.eE+-]+)/m,
  predictedTokensTotal: /^llamacpp:tokens_predicted_total\s+([0-9.eE+-]+)/m,
  predictedSecondsTotal: /^llamacpp:tokens_predicted_seconds_total\s+([0-9.eE+-]+)/m,
};

export function parseLlamaCppMetrics(text: string): LlamaCppMetricsSnapshot {
  const snapshot: LlamaCppMetricsSnapshot = {};
  for (const key of Object.keys(METRIC_PATTERNS) as (keyof LlamaCppMetricsSnapshot)[]) {
    const match = text.match(METRIC_PATTERNS[key]);
    if (match) snapshot[key] = Number(match[1]);
  }
  return snapshot;
}

/** Fetches and parses one snapshot. Never throws — returns undefined on any failure so a dead
 * or missing metrics endpoint degrades to "no throughput data" rather than failing the cell. */
export async function sampleLlamaCppMetrics(
  metricsUrl: string,
  timeoutMs = 5000,
): Promise<LlamaCppMetricsSnapshot | undefined> {
  try {
    const base = metricsUrl.replace(/\/+$/, "");
    const res = await fetch(`${base}/metrics`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return undefined;
    return parseLlamaCppMetrics(await res.text());
  } catch {
    return undefined;
  }
}

/** Diffs two snapshots. Clamped at 0 so a counter reset (server restart mid-batch) can't
 * produce a negative delta. Returns undefined if either snapshot is missing. */
export function diffLlamaCppMetrics(
  before: LlamaCppMetricsSnapshot | undefined,
  after: LlamaCppMetricsSnapshot | undefined,
): LlamaCppMetricsDelta | undefined {
  if (!before || !after) return undefined;
  const delta = (a?: number, b?: number): number | undefined =>
    a !== undefined && b !== undefined ? Math.max(0, b - a) : undefined;
  return {
    promptTokens: delta(before.promptTokensTotal, after.promptTokensTotal),
    promptSeconds: delta(before.promptSecondsTotal, after.promptSecondsTotal),
    predictedTokens: delta(before.predictedTokensTotal, after.predictedTokensTotal),
    predictedSeconds: delta(before.predictedSecondsTotal, after.predictedSecondsTotal),
  };
}
