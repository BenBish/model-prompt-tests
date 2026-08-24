/**
 * Versioned, machine-readable result contract for cross-repository consumers (BSH-223).
 *
 * This is the only interface a consumer like Halo-Maxxing should read. It composes the
 * existing report/statistics/health machinery rather than re-deriving metrics, so a contract
 * consumer never disagrees with `bun bench/src/cli.ts report`.
 */
import type { Database } from "bun:sqlite";
import { getExperiment, getExperimentForBatch } from "../db/experimentsRepo";
import type { EnvironmentFingerprint, ExperimentManifest } from "../experiment/manifest";
import { queryReportData } from "../report/queryData";
import type { Interval } from "../report/statistics";
import { querySweReportData, type SweOutcomeCategory } from "../swe/sweReportData";

export const RESULT_CONTRACT_VERSION = 1 as const;

export type ContractHealthStatus =
  | "healthy"
  | "unhealthy"
  | "infrastructure-failure"
  | "unvalidated"
  | "not-applicable"
  | "unknown";

export interface ResultContractHealth {
  status: ContractHealthStatus;
  comparableRuns: number;
  quarantinedRuns: number;
}

export interface ResultContractMetrics {
  /** The single number a verdict should compare against a baseline's, when defined. */
  primary?: { name: string; value: number; interval?: Interval };
  /** Everything else a verdict or report may want, by name. Undefined values are omitted. */
  secondary: Record<string, number>;
}

export interface ResultContract {
  schemaVersion: typeof RESULT_CONTRACT_VERSION;
  generatedAt: string;
  kind: "prompt" | "swe";
  runBatchId: string;
  modelId: string;
  /** True when this batch predates experiment provenance (BSH-220) and cannot be rehydrated. */
  legacy: boolean;
  experimentId?: string;
  manifestHash?: string;
  environmentFingerprint?: EnvironmentFingerprint;
  totalRuns: number;
  okRuns: number;
  outcomeCounts: Partial<Record<SweOutcomeCategory | "unknown", number>>;
  health: ResultContractHealth;
  metrics: ResultContractMetrics;
  artifacts: { runBatchId: string };
}

function manifestOf(db: Database, batchId: string): ExperimentManifest | undefined {
  return getExperimentForBatch(db, batchId)?.manifest;
}

function experimentIdOf(db: Database, batchId: string): string | undefined {
  const row = db
    .query<{ experiment_id: string | null }, [string]>(
      "SELECT experiment_id FROM runs WHERE run_batch_id = ? AND experiment_id IS NOT NULL LIMIT 1",
    )
    .get(batchId);
  return row?.experiment_id ?? undefined;
}

function buildSweContract(db: Database, batchId: string, modelId: string): ResultContract {
  const data = querySweReportData(db, { runBatchId: batchId, allRuns: true });
  const summary = data.summaries.find((s) => s.harnessModelId === modelId);
  const rate = data.statisticalAnalysis.rates.find((r) => r.modelId === modelId);

  const healthRows = db
    .query<{ health_status: string | null; publication_status: string }, [string, string]>(
      `SELECT s.health_status, s.publication_status
         FROM runs r JOIN swe_results s ON s.run_id = r.id
        WHERE r.run_batch_id = ? AND r.model_id = ?`,
    )
    .all(batchId, modelId);
  const statuses = new Set(healthRows.map((r) => r.health_status ?? "unknown"));
  const status: ContractHealthStatus = statuses.has("infrastructure-failure")
    ? "infrastructure-failure"
    : statuses.has("unhealthy")
      ? "unhealthy"
      : statuses.has("unvalidated")
        ? "unvalidated"
        : statuses.size === 0
          ? "unknown"
          : statuses.has("healthy") && statuses.size === 1
            ? "healthy"
            : "unknown";

  const outcomeCounts: Partial<Record<SweOutcomeCategory | "unknown", number>> = {};
  const outcomeRows = db
    .query<{ outcome_category: string | null; n: number }, [string, string]>(
      `SELECT s.outcome_category, COUNT(*) as n
         FROM runs r JOIN swe_results s ON s.run_id = r.id
        WHERE r.run_batch_id = ? AND r.model_id = ?
        GROUP BY s.outcome_category`,
    )
    .all(batchId, modelId);
  for (const row of outcomeRows) {
    const key = (row.outcome_category ?? "unknown") as SweOutcomeCategory | "unknown";
    outcomeCounts[key] = row.n;
  }

  const experimentId = experimentIdOf(db, batchId);
  const manifest = manifestOf(db, batchId);

  const secondary: Record<string, number> = {};
  if (summary) {
    if (summary.avgAgentLatencyMs !== undefined) secondary.avgLatencyMs = summary.avgAgentLatencyMs;
    if (summary.avgDecodeTokensPerSec !== undefined) secondary.avgDecodeTokensPerSec = summary.avgDecodeTokensPerSec;
    if (summary.avgPromptTokensPerSec !== undefined) secondary.avgPromptTokensPerSec = summary.avgPromptTokensPerSec;
    if (summary.avgVerifyPassRate !== undefined) secondary.avgVerifyPassRate = summary.avgVerifyPassRate;
    secondary.timeouts = summary.timeouts;
    secondary.infrastructureFailures = summary.infrastructureFailures;
    secondary.candidateFailures = summary.candidateFailures;
  }

  return {
    schemaVersion: RESULT_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    kind: "swe",
    runBatchId: batchId,
    modelId,
    legacy: experimentId === undefined,
    experimentId,
    manifestHash: experimentId,
    environmentFingerprint: manifest?.environment,
    totalRuns: summary?.totalRuns ?? 0,
    okRuns: summary?.okRuns ?? 0,
    outcomeCounts,
    health: {
      status,
      comparableRuns: healthRows.filter((r) => r.publication_status === "comparable").length,
      quarantinedRuns: healthRows.filter((r) => r.publication_status === "quarantined").length,
    },
    metrics: {
      primary:
        summary?.intentionToEvaluatePassRate !== undefined
          ? { name: "intentionToEvaluatePassRate", value: summary.intentionToEvaluatePassRate, interval: rate?.interval }
          : undefined,
      secondary,
    },
    artifacts: { runBatchId: batchId },
  };
}

function buildPromptContract(db: Database, batchId: string, modelId: string): ResultContract {
  const data = queryReportData(db, { runBatchId: batchId, allRuns: true });
  const summary = data.summaries.find((s) => s.modelId === modelId);
  const experimentId = experimentIdOf(db, batchId);
  const manifest = manifestOf(db, batchId);

  const secondary: Record<string, number> = {};
  if (summary) {
    if (summary.avgLatencyMs !== undefined) secondary.avgLatencyMs = summary.avgLatencyMs;
    if (summary.medianScore !== undefined) secondary.medianScore = summary.medianScore;
    secondary.errorRuns = summary.errorRuns;
  }

  return {
    schemaVersion: RESULT_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    kind: "prompt",
    runBatchId: batchId,
    modelId,
    legacy: experimentId === undefined,
    experimentId,
    manifestHash: experimentId,
    environmentFingerprint: manifest?.environment,
    totalRuns: (summary?.okRuns ?? 0) + (summary?.errorRuns ?? 0),
    okRuns: summary?.okRuns ?? 0,
    outcomeCounts: {},
    health: { status: "not-applicable", comparableRuns: summary?.okRuns ?? 0, quarantinedRuns: 0 },
    metrics: {
      primary: summary?.avgScore !== undefined ? { name: "avgScore", value: summary.avgScore } : undefined,
      secondary,
    },
    artifacts: { runBatchId: batchId },
  };
}

export function buildResultContract(
  db: Database,
  batchId: string,
  modelId: string,
  kind: "prompt" | "swe",
): ResultContract {
  return kind === "swe" ? buildSweContract(db, batchId, modelId) : buildPromptContract(db, batchId, modelId);
}

/** Rehydrate a contract by experiment id alone, when the batch id has been discarded. */
export function experimentById(db: Database, experimentId: string): ExperimentManifest | undefined {
  return getExperiment(db, experimentId)?.manifest;
}
