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
import { compareExperiments } from "../experiment/compatibility";
import { queryReportData } from "../report/queryData";
import type { Interval } from "../report/statistics";
import type { PromptOutcomeCategory } from "../runner/promptOutcome";
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
  kind: "prompt" | "swe" | "tool-probe";
  runBatchId: string;
  /** Present for a composed export; omitted to preserve the single-batch v1 shape. */
  runBatchIds?: string[];
  modelId: string;
  /** True when this batch predates experiment provenance (BSH-220) and cannot be rehydrated. */
  legacy: boolean;
  experimentId?: string;
  manifestHash?: string;
  environmentFingerprint?: EnvironmentFingerprint;
  totalRuns: number;
  okRuns: number;
  outcomeCounts: Partial<Record<SweOutcomeCategory | PromptOutcomeCategory | "unknown", number>>;
  health: ResultContractHealth;
  metrics: ResultContractMetrics;
  artifacts: { runBatchId: string; runBatchIds?: string[] };
}

interface SelectedRuns { runIds: number[]; batchIds: string[] }

function selectRuns(
  db: Database,
  batchIds: string[],
  modelId: string,
  kind: "prompt" | "swe" | "tool-probe",
): SelectedRuns {
  const selected = new Map<string, { id: number; complete: boolean; startedAt: string }>();
  for (const batchId of batchIds) {
    const rows = db.query<any, [string, string]>(
      `SELECT r.id, r.prompt_id, r.model_id, r.repeat_index, r.status, r.started_at,
              s.publication_status, t.case_id
         FROM runs r
         LEFT JOIN swe_results s ON s.run_id = r.id
         LEFT JOIN tool_probe_results t ON t.run_id = r.id
        WHERE r.run_batch_id = ? AND r.model_id = ?
          AND ${kind === "tool-probe" ? "t.run_id IS NOT NULL" : `r.kind = '${kind}'${kind === "prompt" ? " AND t.run_id IS NULL" : ""}`}`,
    ).all(batchId, modelId);
    if (rows.length === 0) {
      throw new Error(`no ${kind} evidence found for model "${modelId}" in batch "${batchId}"`);
    }
    for (const row of rows) {
      const cellPart = kind === "tool-probe" ? row.case_id : row.prompt_id;
      const key = `${cellPart}\0${row.model_id}\0${row.repeat_index ?? 0}`;
      const complete = row.status === "ok" && (kind !== "swe" || row.publication_status === "comparable");
      const previous = selected.get(key);
      if (previous?.complete && complete) {
        throw new Error(`duplicate completed ${kind} cell "${cellPart}" repeat ${row.repeat_index ?? 0} across selected batches`);
      }
      if (!previous || (complete && !previous.complete) || (!complete && !previous.complete && row.started_at > previous.startedAt)) {
        selected.set(key, { id: row.id, complete, startedAt: row.started_at });
      }
    }
  }
  return { runIds: [...selected.values()].map((row) => row.id), batchIds };
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

function buildSweContract(db: Database, batchId: string, modelId: string, runIds?: number[]): ResultContract {
  const data = querySweReportData(db, runIds ? { runIds, allRuns: true } : { runBatchId: batchId, allRuns: true });
  const summary = data.summaries.find((s) => s.harnessModelId === modelId);
  const rate = data.statisticalAnalysis.rates.find((r) => r.modelId === modelId);

  const healthRows = db
    .query<{ health_status: string | null; publication_status: string }, [string, string]>(
      `SELECT s.health_status, s.publication_status
         FROM runs r JOIN swe_results s ON s.run_id = r.id
        WHERE ${runIds ? `r.id IN (${runIds.join(",")}) AND ? IS NOT NULL AND ? IS NOT NULL` : "r.run_batch_id = ? AND r.model_id = ?"}`,
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
        WHERE ${runIds ? `r.id IN (${runIds.join(",")}) AND ? IS NOT NULL AND ? IS NOT NULL` : "r.run_batch_id = ? AND r.model_id = ?"}
        GROUP BY s.outcome_category`,
    )
    .all(batchId, modelId);
  for (const row of outcomeRows) {
    const key = (row.outcome_category ?? "unknown") as SweOutcomeCategory | "unknown";
    outcomeCounts[key] = row.n;
  }

  const experimentId = experimentIdOf(db, batchId);
  const manifest = manifestOf(db, batchId);

  const costRow = db
    .query<{ total: number | null }, [string, string]>(
      `SELECT SUM(cost_usd) as total FROM runs WHERE ${runIds ? `id IN (${runIds.join(",")}) AND ? IS NOT NULL AND ? IS NOT NULL` : "run_batch_id = ? AND model_id = ?"}`,
    )
    .get(batchId, modelId);

  const secondary: Record<string, number> = { totalCostUsd: costRow?.total ?? 0 };
  if (summary) {
    if (summary.avgAgentLatencyMs !== undefined) secondary.avgLatencyMs = summary.avgAgentLatencyMs;
    if (summary.avgDecodeTokensPerSec !== undefined) secondary.avgDecodeTokensPerSec = summary.avgDecodeTokensPerSec;
    if (summary.avgPromptTokensPerSec !== undefined) secondary.avgPromptTokensPerSec = summary.avgPromptTokensPerSec;
    if (summary.avgVerifyPassRate !== undefined) secondary.avgVerifyPassRate = summary.avgVerifyPassRate;
    // Distinct from outcomeCounts.passed/candidate_failure: these two are restricted to `ok`
    // runs with a terminal verify result, matching the pre-contract verifyPassed/verifyFailed
    // definition legacy Halo reports still key off of.
    secondary.verifyPassed = summary.passedRuns;
    secondary.verifyFailed = summary.failedRuns;
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

function buildPromptContract(db: Database, batchId: string, modelId: string, runIds?: number[]): ResultContract {
  const data = queryReportData(db, runIds ? { runIds, allRuns: true } : { runBatchId: batchId, allRuns: true });
  const summary = data.summaries.find((s) => s.modelId === modelId);
  const experimentId = experimentIdOf(db, batchId);
  const manifest = manifestOf(db, batchId);

  const emptyRow = db
    .query<{ empty: number }, [string, string]>(
      `SELECT COUNT(*) as empty FROM runs
        WHERE ${runIds ? `id IN (${runIds.join(",")}) AND ? IS NOT NULL AND ? IS NOT NULL` : "run_batch_id = ? AND model_id = ?"} AND kind = 'prompt' AND status = 'ok'
          AND TRIM(COALESCE(output_text, '')) = ''`,
    )
    .get(batchId, modelId);

  const secondary: Record<string, number> = {
    totalCostUsd: summary?.totalCostUsd ?? 0,
    emptyRuns: emptyRow?.empty ?? 0,
    emptyRatePct: summary && summary.okRuns > 0 ? ((emptyRow?.empty ?? 0) / summary.okRuns) * 100 : 0,
  };
  if (summary) {
    if (summary.avgLatencyMs !== undefined) secondary.avgLatencyMs = summary.avgLatencyMs;
    if (summary.medianScore !== undefined) secondary.medianScore = summary.medianScore;
    secondary.errorRuns = summary.errorRuns;
    secondary.infrastructureFailures = summary.infrastructureFailures;
    secondary.candidateFailures = summary.candidateFailures;
  }

  const outcomeRows = db
    .query<{ outcome_category: string | null; n: number }, [string, string]>(
      `SELECT outcome_category, COUNT(*) AS n FROM runs
        WHERE ${runIds ? `id IN (${runIds.join(",")}) AND ? IS NOT NULL AND ? IS NOT NULL` : "run_batch_id = ? AND model_id = ?"} AND kind = 'prompt'
        GROUP BY outcome_category`,
    )
    .all(batchId, modelId);
  const outcomeCounts: Partial<Record<PromptOutcomeCategory | "unknown", number>> = {};
  for (const row of outcomeRows) {
    const key = (row.outcome_category ?? "unknown") as PromptOutcomeCategory | "unknown";
    outcomeCounts[key] = row.n;
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
    outcomeCounts,
    health: { status: "not-applicable", comparableRuns: summary?.okRuns ?? 0, quarantinedRuns: 0 },
    metrics: {
      primary: summary?.avgScore !== undefined ? { name: "avgScore", value: summary.avgScore } : undefined,
      secondary,
    },
    artifacts: { runBatchId: batchId },
  };
}

function buildToolProbeContract(db: Database, batchId: string, modelId: string, runIds?: number[]): ResultContract {
  const rows = db
    .query<{ well_formed: number; correct_tool: number; valid_args: number }, [string, string]>(
      `SELECT t.well_formed, t.correct_tool, t.valid_args
         FROM tool_probe_results t JOIN runs r ON r.id = t.run_id
        WHERE ${runIds ? `r.id IN (${runIds.join(",")}) AND ? IS NOT NULL AND ? IS NOT NULL` : "r.run_batch_id = ? AND r.model_id = ?"}`,
    )
    .all(batchId, modelId);

  const wellFormed = rows.filter((r) => r.well_formed === 1).length;
  const wellFormedPct = rows.length > 0 ? (wellFormed / rows.length) * 100 : undefined;
  const experimentId = experimentIdOf(db, batchId);
  const manifest = manifestOf(db, batchId);

  return {
    schemaVersion: RESULT_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    kind: "tool-probe",
    runBatchId: batchId,
    modelId,
    legacy: experimentId === undefined,
    experimentId,
    manifestHash: experimentId,
    environmentFingerprint: manifest?.environment,
    totalRuns: rows.length,
    okRuns: rows.length,
    outcomeCounts: {},
    health: { status: "not-applicable", comparableRuns: rows.length, quarantinedRuns: 0 },
    metrics: {
      primary: wellFormedPct !== undefined ? { name: "wellFormedPct", value: wellFormedPct } : undefined,
      secondary: {
        cases: rows.length,
        wellFormed,
        correctTool: rows.filter((r) => r.correct_tool === 1).length,
        validArgs: rows.filter((r) => r.valid_args === 1).length,
      },
    },
    artifacts: { runBatchId: batchId },
  };
}

export function buildResultContract(
  db: Database,
  batchIdOrIds: string | string[],
  modelId: string,
  kind: "prompt" | "swe" | "tool-probe",
): ResultContract {
  const batchIds = [...new Set(Array.isArray(batchIdOrIds) ? batchIdOrIds : [batchIdOrIds])];
  if (batchIds.length === 0) throw new Error("at least one batch id is required");
  const batchId = batchIds[0]!;
  // Validate evidence before provenance so an unknown/stale id retains the single-batch
  // fail-closed error instead of being misreported as a legacy compatibility problem.
  const selection = batchIds.length > 1 ? selectRuns(db, batchIds, modelId, kind) : undefined;
  if (batchIds.length > 1) {
    const experiments = batchIds.map((id) => ({ id, experiment: getExperimentForBatch(db, id) }));
    const legacy = experiments.map((entry) => entry.experiment === undefined);
    if (legacy.some(Boolean) && legacy.some((value) => !value)) {
      throw new Error("cannot mix legacy and provenance-bearing batches");
    }
    if (!legacy[0]) {
      const base = experiments[0]!.experiment!.manifest;
      for (const entry of experiments.slice(1)) {
        const comparison = compareExperiments(base, entry.experiment!.manifest);
        if (!comparison.compatible) {
          throw new Error(`incompatible experiment manifests for batches "${batchId}" and "${entry.id}": ${comparison.differences.filter((d) => d.category === "semantic").map((d) => d.path).join(", ")}`);
        }
      }
    }
  }
  // A typo, stale batch id, or mismatched kind must not look like valid zero-coverage evidence
  // to a cross-repository consumer. Halo treats a successfully parsed contract as the
  // benchmark's authoritative result, so missing evidence belongs on the CLI error path.
  const evidenceCount =
    kind === "tool-probe"
      ? (
          db
            .query<{ n: number }, [string, string]>(
              `SELECT COUNT(*) AS n
                 FROM runs r JOIN tool_probe_results t ON t.run_id = r.id
                WHERE r.run_batch_id = ? AND r.model_id = ?`,
            )
            .get(batchId, modelId)?.n ?? 0
        )
      : (
          db
            .query<{ n: number }, [string, string, string]>(
              `SELECT COUNT(*) AS n FROM runs r
                WHERE r.run_batch_id = ? AND r.model_id = ? AND r.kind = ?
                  ${kind === "prompt" ? "AND NOT EXISTS (SELECT 1 FROM tool_probe_results t WHERE t.run_id = r.id)" : ""}`,
            )
            .get(batchId, modelId, kind)?.n ?? 0
        );
  if (evidenceCount === 0) {
    throw new Error(
      `no ${kind} evidence found for model "${modelId}" in batch "${batchId}"`,
    );
  }

  const contract =
    kind === "swe"
      ? buildSweContract(db, batchId, modelId, selection?.runIds)
      : kind === "tool-probe"
        ? buildToolProbeContract(db, batchId, modelId, selection?.runIds)
        : buildPromptContract(db, batchId, modelId, selection?.runIds);

  if (batchIds.length > 1) {
    const baseManifest = manifestOf(db, batchId);
    if (baseManifest) {
      for (const otherId of batchIds.slice(1)) {
        const comparison = compareExperiments(baseManifest, manifestOf(db, otherId)!);
        const hasPerformanceMetrics = contract.metrics.secondary.avgLatencyMs !== undefined ||
          contract.metrics.secondary.avgDecodeTokensPerSec !== undefined ||
          contract.metrics.secondary.avgPromptTokensPerSec !== undefined;
        if (!comparison.performanceComparable && hasPerformanceMetrics) {
          throw new Error(`environment-incompatible experiment manifests for batches "${batchId}" and "${otherId}": ${comparison.differences.filter((d) => d.category === "environment").map((d) => d.path).join(", ")}`);
        }
      }
    }
    contract.runBatchIds = batchIds;
    contract.artifacts.runBatchIds = batchIds;
  }

  return contract;
}

/** Rehydrate a contract by experiment id alone, when the batch id has been discarded. */
export function experimentById(db: Database, experimentId: string): ExperimentManifest | undefined {
  return getExperiment(db, experimentId)?.manifest;
}
