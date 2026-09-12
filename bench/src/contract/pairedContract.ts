/**
 * Versioned paired-comparison contract for cross-repository consumers (BSH-361).
 *
 * `resultContract.ts` exports one model's own metrics in isolation. This module exports the
 * matched-task, hierarchical-bootstrap comparison between two specific models (a candidate and
 * a named baseline) that the statistics layer (`report/statistics.ts`) already knows how to
 * compute — Halo previously only ever received each arm's independent Wilson interval and did
 * its own (weaker, unmatched) point comparison client-side.
 */
import type { Database } from "bun:sqlite";
import { getExperimentForBatch } from "../db/experimentsRepo";
import { compareExperiments } from "../experiment/compatibility";
import {
  DEFAULT_STATISTICAL_CONFIG,
  pairedScoreComparison,
  type PairedComparison,
  type ScoreTrial,
  type StatisticalConfig,
} from "../report/statistics";
import { PROMPT_INFRASTRUCTURE_OUTCOMES, type PromptOutcomeCategory } from "../runner/promptOutcome";

export const PAIRED_CONTRACT_VERSION = 1 as const;

const SWE_INFRASTRUCTURE_OUTCOMES = new Set(["harness_error", "verifier_error", "judge_error"]);

export type CompatibilityStatus = "compatible" | "incompatible" | "unknown";

export interface PairedCompatibility {
  /** "unknown" when either arm has no experiment manifest (legacy batch) — never assumed
   *  compatible just because no evidence of a difference exists. */
  status: CompatibilityStatus;
  performanceComparable: boolean;
  differences: { path: string; category: "semantic" | "environment" }[];
}

export interface PairedContractArm {
  modelId: string;
  runBatchId: string;
  totalRuns: number;
  okRuns: number;
  /** Distinct tasks with at least one comparable run, over the manifest's own intended task
   *  count. Omitted — never coerced to zero — when the arm has no manifest to size the
   *  denominator from. */
  taskCoveragePct?: number;
  /** Share of comparable runs that received a grading score. Omitted for a kind/suite with no
   *  grading step (e.g. SWE's terminal verify signal is not a judge score). */
  judgeCoveragePct?: number;
}

export interface PairedResultContract {
  schemaVersion: typeof PAIRED_CONTRACT_VERSION;
  generatedAt: string;
  kind: "swe" | "prompt";
  candidate: PairedContractArm;
  baseline: PairedContractArm;
  compatibility: PairedCompatibility;
  comparison: PairedComparison;
}

interface ArmRow {
  taskId: string;
  status: "ok" | "error";
  comparable: boolean;
  score: number | undefined;
  infrastructureFailure: boolean;
  environmentFingerprint?: string;
}

function sweArmRows(db: Database, batchId: string, modelId: string): ArmRow[] {
  const rows = db
    .query<
      { prompt_id: string; status: "ok" | "error"; verify_passed: number | null; outcome_category: string | null; publication_status: string | null; environment_fingerprint: string | null },
      [string, string]
    >(
      `SELECT r.prompt_id, r.status, s.verify_passed, s.outcome_category, s.publication_status, s.environment_fingerprint
         FROM runs r LEFT JOIN swe_results s ON s.run_id = r.id
        WHERE r.run_batch_id = ? AND r.model_id = ? AND r.kind = 'swe'`,
    )
    .all(batchId, modelId);
  return rows.map((row) => {
    const comparable = row.publication_status === "comparable";
    return {
      taskId: row.prompt_id,
      status: row.status,
      comparable,
      score: comparable ? (row.verify_passed ? 1 : 0) : undefined,
      infrastructureFailure: row.outcome_category ? SWE_INFRASTRUCTURE_OUTCOMES.has(row.outcome_category) : row.status === "error",
      environmentFingerprint: row.environment_fingerprint ?? undefined,
    };
  });
}

function promptArmRows(db: Database, batchId: string, modelId: string): ArmRow[] {
  const rows = db
    .query<{ id: number; prompt_id: string; status: "ok" | "error"; outcome_category: string | null }, [string, string]>(
      `SELECT r.id, r.prompt_id, r.status, r.outcome_category
         FROM runs r
        WHERE r.run_batch_id = ? AND r.model_id = ? AND r.kind = 'prompt'
          AND NOT EXISTS (SELECT 1 FROM tool_probe_results t WHERE t.run_id = r.id)`,
    )
    .all(batchId, modelId);
  const scoreByRun = new Map(
    db
      .query<{ run_id: number; score: number }, []>(
        `SELECT run_id, AVG(score) as score FROM scores WHERE status = 'ok' GROUP BY run_id`,
      )
      .all()
      .map((row) => [row.run_id, row.score]),
  );
  return rows.map((row) => ({
    taskId: row.prompt_id,
    status: row.status,
    comparable: row.status === "ok",
    score: row.status === "ok" ? scoreByRun.get(row.id) : undefined,
    infrastructureFailure: row.outcome_category
      ? PROMPT_INFRASTRUCTURE_OUTCOMES.has(row.outcome_category as PromptOutcomeCategory)
      : row.status === "error",
  }));
}

function intendedTaskCount(db: Database, batchId: string): number | undefined {
  const experiment = getExperimentForBatch(db, batchId);
  return experiment?.manifest.tasks.length;
}

function buildArm(db: Database, kind: "swe" | "prompt", batchId: string, modelId: string): { arm: PairedContractArm; rows: ArmRow[] } {
  const rows = kind === "swe" ? sweArmRows(db, batchId, modelId) : promptArmRows(db, batchId, modelId);
  if (rows.length === 0) {
    throw new Error(`no ${kind} evidence found for model "${modelId}" in batch "${batchId}"`);
  }
  const okRows = rows.filter((r) => r.status === "ok");
  const comparableRows = rows.filter((r) => r.comparable);
  const intended = intendedTaskCount(db, batchId);
  const distinctTasks = new Set(comparableRows.map((r) => r.taskId)).size;
  const gradedRows = comparableRows.filter((r) => r.score !== undefined);
  return {
    arm: {
      modelId,
      runBatchId: batchId,
      totalRuns: rows.length,
      okRuns: okRows.length,
      taskCoveragePct: intended && intended > 0 ? (distinctTasks / intended) * 100 : undefined,
      judgeCoveragePct: kind === "prompt" && comparableRows.length > 0 ? (gradedRows.length / comparableRows.length) * 100 : undefined,
    },
    rows,
  };
}

function toTrials(modelId: string, rows: ArmRow[]): ScoreTrial[] {
  return rows
    .filter((r) => r.score !== undefined)
    .map((r) => ({
      taskId: r.taskId,
      modelId,
      score: r.score!,
      infrastructureFailure: r.infrastructureFailure,
      environmentFingerprint: r.environmentFingerprint,
    }));
}

/**
 * Build the paired candidate-vs-baseline comparison. Fails closed the same way
 * `buildResultContract` does: a typo'd batch/model id must not look like valid zero-coverage
 * evidence to a cross-repository consumer.
 */
export function buildPairedContract(
  db: Database,
  kind: "swe" | "prompt",
  candidate: { runBatchId: string; modelId: string },
  baseline: { runBatchId: string; modelId: string },
  options: Partial<StatisticalConfig> = {},
): PairedResultContract {
  const { arm: candidateArm, rows: candidateRows } = buildArm(db, kind, candidate.runBatchId, candidate.modelId);
  const { arm: baselineArm, rows: baselineRows } = buildArm(db, kind, baseline.runBatchId, baseline.modelId);

  const candidateManifest = getExperimentForBatch(db, candidate.runBatchId)?.manifest;
  const baselineManifest = getExperimentForBatch(db, baseline.runBatchId)?.manifest;
  const compatibility: PairedCompatibility =
    candidateManifest && baselineManifest
      ? (() => {
          const result = compareExperiments(baselineManifest, candidateManifest);
          return {
            status: result.compatible ? "compatible" : "incompatible",
            performanceComparable: result.performanceComparable,
            differences: result.differences.map((d) => ({ path: d.path, category: d.category })),
          };
        })()
      : { status: "unknown", performanceComparable: false, differences: [] };

  const trials = [...toTrials(baseline.modelId, baselineRows), ...toTrials(candidate.modelId, candidateRows)];
  const config: Partial<StatisticalConfig> = { ...DEFAULT_STATISTICAL_CONFIG, ...options };
  const comparison = pairedScoreComparison(baseline.modelId, candidate.modelId, trials, config);
  if (compatibility.status !== "compatible") {
    comparison.verdict = "inconclusive";
    comparison.warnings.push(
      compatibility.status === "unknown"
        ? "experiment manifest unavailable for one or both arms: compatibility unknown, verdict suppressed"
        : `incompatible experiments (${compatibility.differences.map((d) => d.path).join(", ")}): verdict suppressed`,
    );
  }

  return {
    schemaVersion: PAIRED_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    kind,
    candidate: candidateArm,
    baseline: baselineArm,
    compatibility,
    comparison,
  };
}
