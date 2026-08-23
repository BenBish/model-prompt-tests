import type { Database } from "bun:sqlite";

export interface SweResultRecord {
  runId: number;
  taskType: "fixture" | "external" | "code-review";
  workdir?: string;
  baselineSha?: string;
  diffPatch?: string;
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
  transcript?: string;
  agentExitCode?: number;
  agentTimedOut?: boolean;
  verifyCommand?: string;
  verifyExitCode?: number;
  verifyPassed?: boolean;
  verifyOutput?: string;
  verifyDurationMs?: number;
  /** Parsed from verify output (bun test summary) when available; undefined otherwise. */
  verifyTestsPassed?: number;
  verifyTestsTotal?: number;
  reviewMetrics?: unknown;
  error?: string;
  /** llama.cpp /metrics counter deltas sampled around the agent run (local harnesses only). */
  serverPromptTokens?: number;
  serverPromptSeconds?: number;
  serverPredictedTokens?: number;
  serverPredictedSeconds?: number;
  taskLifecycle?: string;
  graderVersion?: string;
  healthStatus?: string;
  environmentFingerprint?: string;
  healthValidatedAt?: string;
  publicationStatus?: "comparable" | "quarantined";
}

export interface SweResultRow extends SweResultRecord {
  id: number;
}

export function insertSweResult(db: Database, record: SweResultRecord): number {
  const stmt = db.prepare(`
    INSERT INTO swe_results (
      run_id, task_type, workdir, baseline_sha, diff_patch, files_changed, lines_added,
      lines_removed, transcript, agent_exit_code, agent_timed_out, verify_command,
      verify_exit_code, verify_passed, verify_output, verify_duration_ms, review_metrics, error,
      server_prompt_tokens, server_prompt_seconds, server_predicted_tokens, server_predicted_seconds,
      verify_tests_passed, verify_tests_total, task_lifecycle, grader_version, health_status,
      environment_fingerprint, health_validated_at, publication_status
    ) VALUES (
      $runId, $taskType, $workdir, $baselineSha, $diffPatch, $filesChanged, $linesAdded,
      $linesRemoved, $transcript, $agentExitCode, $agentTimedOut, $verifyCommand,
      $verifyExitCode, $verifyPassed, $verifyOutput, $verifyDurationMs, $reviewMetrics, $error,
      $serverPromptTokens, $serverPromptSeconds, $serverPredictedTokens, $serverPredictedSeconds,
      $verifyTestsPassed, $verifyTestsTotal, $taskLifecycle, $graderVersion, $healthStatus,
      $environmentFingerprint, $healthValidatedAt, $publicationStatus
    )
  `);

  const result = stmt.run({
    $runId: record.runId,
    $taskType: record.taskType,
    $workdir: record.workdir ?? null,
    $baselineSha: record.baselineSha ?? null,
    $diffPatch: record.diffPatch ?? null,
    $filesChanged: record.filesChanged ?? null,
    $linesAdded: record.linesAdded ?? null,
    $linesRemoved: record.linesRemoved ?? null,
    $transcript: record.transcript ?? null,
    $agentExitCode: record.agentExitCode ?? null,
    $agentTimedOut: record.agentTimedOut ? 1 : 0,
    $verifyCommand: record.verifyCommand ?? null,
    $verifyExitCode: record.verifyExitCode ?? null,
    $verifyPassed: record.verifyPassed === undefined ? null : record.verifyPassed ? 1 : 0,
    $verifyOutput: record.verifyOutput ?? null,
    $verifyDurationMs: record.verifyDurationMs ?? null,
    $reviewMetrics: record.reviewMetrics !== undefined ? JSON.stringify(record.reviewMetrics) : null,
    $error: record.error ?? null,
    $serverPromptTokens: record.serverPromptTokens ?? null,
    $serverPromptSeconds: record.serverPromptSeconds ?? null,
    $serverPredictedTokens: record.serverPredictedTokens ?? null,
    $serverPredictedSeconds: record.serverPredictedSeconds ?? null,
    $verifyTestsPassed: record.verifyTestsPassed ?? null,
    $verifyTestsTotal: record.verifyTestsTotal ?? null,
    $taskLifecycle: record.taskLifecycle ?? null,
    $graderVersion: record.graderVersion ?? null,
    $healthStatus: record.healthStatus ?? null,
    $environmentFingerprint: record.environmentFingerprint ?? null,
    $healthValidatedAt: record.healthValidatedAt ?? null,
    $publicationStatus: record.publicationStatus ?? "comparable",
  });

  return Number(result.lastInsertRowid);
}

export function getSweResultForRun(db: Database, runId: number): SweResultRow | undefined {
  const row = db.query("SELECT * FROM swe_results WHERE run_id = $runId").get({ $runId: runId }) as any;
  if (!row) return undefined;
  return rowToSweResultRow(row);
}

function rowToSweResultRow(row: any): SweResultRow {
  return {
    id: row.id,
    runId: row.run_id,
    taskType: row.task_type,
    workdir: row.workdir ?? undefined,
    baselineSha: row.baseline_sha ?? undefined,
    diffPatch: row.diff_patch ?? undefined,
    filesChanged: row.files_changed ?? undefined,
    linesAdded: row.lines_added ?? undefined,
    linesRemoved: row.lines_removed ?? undefined,
    transcript: row.transcript ?? undefined,
    agentExitCode: row.agent_exit_code ?? undefined,
    agentTimedOut: Boolean(row.agent_timed_out),
    verifyCommand: row.verify_command ?? undefined,
    verifyExitCode: row.verify_exit_code ?? undefined,
    verifyPassed: row.verify_passed === null ? undefined : Boolean(row.verify_passed),
    verifyOutput: row.verify_output ?? undefined,
    verifyDurationMs: row.verify_duration_ms ?? undefined,
    verifyTestsPassed: row.verify_tests_passed ?? undefined,
    verifyTestsTotal: row.verify_tests_total ?? undefined,
    reviewMetrics: row.review_metrics ? JSON.parse(row.review_metrics) : undefined,
    error: row.error ?? undefined,
    serverPromptTokens: row.server_prompt_tokens ?? undefined,
    serverPromptSeconds: row.server_prompt_seconds ?? undefined,
    serverPredictedTokens: row.server_predicted_tokens ?? undefined,
    serverPredictedSeconds: row.server_predicted_seconds ?? undefined,
    taskLifecycle: row.task_lifecycle ?? undefined,
    graderVersion: row.grader_version ?? undefined,
    healthStatus: row.health_status ?? undefined,
    environmentFingerprint: row.environment_fingerprint ?? undefined,
    healthValidatedAt: row.health_validated_at ?? undefined,
    publicationStatus: row.publication_status ?? undefined,
  };
}
