import type { Database } from "bun:sqlite";
import { average, median, type JudgeReportRow } from "../report/queryData";
import type { VerificationDetail } from "./verifyOutputParser";
import { analyzePairedTrials, hierarchicalBootstrapDelta, type Interval, type StatisticalAnalysis, type StatisticalTrial } from "../report/statistics";

export type SweOutcomeCategory = "passed" | "candidate_failure" | "timeout" | "invalid_output" | "harness_error" | "verifier_error" | "judge_error";

export interface SweReportRow {
  runId: number;
  runBatchId: string;
  taskId: string;
  taskType: "fixture" | "external" | "code-review";
  harnessId: string;
  modelAlias: string;
  harnessModelId: string;
  startedAt: string;
  repeatIndex: number;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  finalMessage?: string;
  error?: string;
  runStatus: "ok" | "error";
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
  /** Parsed from verify output (bun test summary); undefined for non-bun-test verify commands. */
  verifyTestsPassed?: number;
  verifyTestsTotal?: number;
  /** verifyTestsPassed / verifyTestsTotal, distinct from verifyPassed (whole-run binary result). */
  verifyPassRate?: number;
  verificationDetail?: VerificationDetail;
  outcomeCategory?: SweOutcomeCategory;
  publicationStatus: "comparable" | "quarantined";
  environmentFingerprint?: string;
  experimentId?: string;
  serverPromptTokens?: number;
  serverPromptSeconds?: number;
  serverPredictedTokens?: number;
  serverPredictedSeconds?: number;
  reviewMetrics?: {
    recall?: number;
    precision?: number;
    f1?: number;
    truePositives?: number;
    falseNegatives?: number;
    falsePositives?: number;
    matcherModelId?: string;
  };
  judgeResults: JudgeReportRow[];
}

export interface SweSummary {
  harnessModelId: string;
  totalRuns: number;
  okRuns: number;
  errorRuns: number;
  passedRuns: number;
  failedRuns: number;
  passRate?: number;
  intentionToEvaluatePassRate?: number;
  cleanPassedRuns: number;
  verifiedTimedOutRuns: number;
  cleanPassRate?: number;
  /** Peer judges only (self-judging excluded). */
  avgJudgeScore?: number;
  medianJudgeScore?: number;
  /** Mean of self-judge scores when present; not blended into avgJudgeScore. */
  selfScoreAvg?: number;
  avgAgentLatencyMs?: number;
  avgDiffLines?: number;
  timeouts: number;
  /**
   * Server-side decode/prefill throughput from llama.cpp /metrics deltas, preferred over
   * harness-reported tokens because it survives agent timeouts and generic-cli harnesses that
   * report no usage at all. Weighted by total tokens/seconds across rows (not row-averaged), so
   * one long cell doesn't get diluted by many short ones. Falls back to
   * outputTokens / (latencyMs / 1000) for rows with no server metrics (e.g. cloud harnesses).
   */
  avgDecodeTokensPerSec?: number;
  avgPromptTokensPerSec?: number;
  /** Mean recall/precision/F1 over code-review rows that have review_metrics. */
  avgRecall?: number;
  avgPrecision?: number;
  avgF1?: number;
  reviewRuns: number;
  /**
   * Mean fraction of individual hidden/visible tests passed per run (verifyPassRate), distinct
   * from passRate (fraction of runs that fully passed) — stays informative even when every run
   * in the cell is binary-failing. Undefined when no row's verify command produced parseable
   * per-test counts (e.g. non-bun-test verify commands).
   */
  avgVerifyPassRate?: number;
  /** Task-weighted first scheduled trial success rate. */
  passAt1?: number;
  /** Task-weighted fraction solved at least once across the observed repeats. */
  repeatedTrialSolveRate?: number;
  repeatsObserved: number;
  intentionToEvaluateRuns: number;
  infrastructureFailures: number;
  candidateFailures: number;
  invalidOutputs: number;
  publicationBlockedRuns: number;
  unstableTestCountTasks: number;
}

export interface SweReportData {
  taskIds: string[];
  harnessModelIds: string[];
  rows: Map<string, Map<string, SweReportRow[]>>;
  summaries: SweSummary[];
  statisticalAnalysis: StatisticalAnalysis;
  statisticalTrials: StatisticalTrial[];
  harnessComparisons: HarnessComparison[];
}

export interface HarnessMetricDelta { metric: "correctness" | "latencyMs" | "costUsd" | "diffLines" | "judgeScore"; delta?: number; interval?: Interval; matchedTasks: number }
export interface HarnessComparison { experimentId: string; underlyingModel: string; baselineId: string; candidateId: string; kind: "harness-effect" | "agent-system"; excluded: boolean; reasons: string[]; metrics: HarnessMetricDelta[] }

export interface QuerySweOptions {
  runBatchId?: string;
  allRuns?: boolean;
}

function splitHarnessModelId(modelId: string): { harnessId: string; modelAlias: string } {
  const separatorIndex = modelId.indexOf(":");
  if (separatorIndex === -1) return { harnessId: modelId, modelAlias: "" };
  return { harnessId: modelId.slice(0, separatorIndex), modelAlias: modelId.slice(separatorIndex + 1) };
}

function rowToSweReportRow(row: any): SweReportRow {
  const { harnessId, modelAlias } = splitHarnessModelId(row.model_id);
  const verifyTestsPassed = row.verify_tests_passed ?? undefined;
  const verifyTestsTotal = row.verify_tests_total ?? undefined;
  return {
    runId: row.id,
    runBatchId: row.run_batch_id,
    taskId: row.prompt_id,
    taskType: row.task_type,
    harnessId,
    modelAlias,
    harnessModelId: row.model_id,
    startedAt: row.started_at,
    repeatIndex: row.repeat_index ?? 0,
    latencyMs: row.latency_ms ?? undefined,
    inputTokens: row.input_tokens ?? undefined,
    outputTokens: row.output_tokens ?? undefined,
    costUsd: row.cost_usd ?? undefined,
    finalMessage: row.output_text ?? undefined,
    error: row.error ?? undefined,
    runStatus: row.status,
    workdir: row.workdir ?? undefined,
    baselineSha: row.baseline_sha ?? undefined,
    diffPatch: row.diff_patch ?? undefined,
    filesChanged: row.files_changed ?? undefined,
    linesAdded: row.lines_added ?? undefined,
    linesRemoved: row.lines_removed ?? undefined,
    transcript: row.transcript ?? undefined,
    agentExitCode: row.agent_exit_code ?? undefined,
    agentTimedOut: row.agent_timed_out === null ? undefined : Boolean(row.agent_timed_out),
    verifyCommand: row.verify_command ?? undefined,
    verifyExitCode: row.verify_exit_code ?? undefined,
    verifyPassed: row.verify_passed === null ? undefined : Boolean(row.verify_passed),
    verifyOutput: row.verify_output ?? undefined,
    verifyDurationMs: row.verify_duration_ms ?? undefined,
    verifyTestsPassed,
    verifyTestsTotal,
    verifyPassRate: verifyTestsTotal ? verifyTestsPassed / verifyTestsTotal : undefined,
    verificationDetail: row.verification_detail ? JSON.parse(row.verification_detail) : undefined,
    outcomeCategory: row.outcome_category ?? undefined,
    publicationStatus: row.publication_status ?? "quarantined",
    environmentFingerprint: row.environment_fingerprint ?? undefined,
    experimentId: row.experiment_id ?? undefined,
    serverPromptTokens: row.server_prompt_tokens ?? undefined,
    serverPromptSeconds: row.server_prompt_seconds ?? undefined,
    serverPredictedTokens: row.server_predicted_tokens ?? undefined,
    serverPredictedSeconds: row.server_predicted_seconds ?? undefined,
    reviewMetrics: row.review_metrics ? JSON.parse(row.review_metrics) : undefined,
    judgeResults: [],
  };
}

/**
 * Whether a judge row is self-judging for this SWE cell.
 *
 * Prompt-bench self-judging uses exact model ids. SWE cells use `harness:alias`
 * (e.g. `claude-code:haiku`) while judges use bench model ids (`anthropic:haiku`),
 * so we also treat matching bare aliases and `*:alias` suffixes as self.
 */
export function isSweSelfJudge(row: SweReportRow, judgeModelId: string): boolean {
  if (judgeModelId === row.harnessModelId) return true;
  if (row.modelAlias === "") return false;
  if (judgeModelId === row.modelAlias) return true;
  return judgeModelId.endsWith(`:${row.modelAlias}`);
}

/** Peer (non-self) judge scores for a SWE run. */
function peerScoresForSweRow(row: SweReportRow): number[] {
  return row.judgeResults.flatMap((judge) =>
    judge.score === undefined || isSweSelfJudge(row, judge.judgeModelId) ? [] : [judge.score],
  );
}

function selfScoresForSweRow(row: SweReportRow): number[] {
  return row.judgeResults.flatMap((judge) =>
    judge.score === undefined || !isSweSelfJudge(row, judge.judgeModelId) ? [] : [judge.score],
  );
}

function summarizeSwe(harnessModelIds: string[], rows: SweReportRow[]): SweSummary[] {
  return harnessModelIds.map((harnessModelId) => {
    const cellRows = rows.filter((row) => row.harnessModelId === harnessModelId);
    const comparableRows = cellRows.filter((row) => row.publicationStatus === "comparable");
    const okRows = comparableRows.filter((row) => row.runStatus === "ok");
    const infrastructure = new Set<SweOutcomeCategory>(["harness_error", "verifier_error", "judge_error"]);
    const intentionRows = comparableRows.filter((row) => row.taskType !== "code-review" &&
      (row.outcomeCategory ? !infrastructure.has(row.outcomeCategory) : row.runStatus === "ok"));
    const passedRuns = intentionRows.filter((row) => row.verifyPassed === true || row.outcomeCategory === "passed").length;
    const failedRuns = okRows.filter((row) => row.verifyPassed === false).length;
    const verifiedTotal = passedRuns + failedRuns;
    const cleanPassedRuns = okRows.filter(
      (row) => row.verifyPassed === true && row.agentTimedOut !== true,
    ).length;
    const verifiedTimedOutRuns = okRows.filter(
      (row) => row.verifyPassed === true && row.agentTimedOut === true,
    ).length;

    // Headline judge scores exclude self-judging (see isSweSelfJudge).
    const judgeScores = okRows.flatMap((row) => {
      const rowScore = median(peerScoresForSweRow(row));
      return rowScore === undefined ? [] : [rowScore];
    });
    const selfRunScores = okRows.flatMap((row) => {
      const runSelf = average(selfScoresForSweRow(row));
      return runSelf === undefined ? [] : [runSelf];
    });

    const latencies = okRows.flatMap((row) => (row.latencyMs === undefined ? [] : [row.latencyMs]));
    const diffLines = okRows.flatMap((row) =>
      row.linesAdded === undefined && row.linesRemoved === undefined
        ? []
        : [(row.linesAdded ?? 0) + (row.linesRemoved ?? 0)],
    );
    const timeouts = okRows.filter((row) => row.agentTimedOut === true).length;

    // Weighted (sum tokens / sum seconds) rather than row-averaged, so one long cell isn't
    // diluted by many short ones. Falls back to harness-reported tokens only for decode, since
    // there is no reliable non-server signal for prefill time.
    const serverPredictedRows = okRows.filter(
      (row) =>
        row.serverPredictedTokens !== undefined &&
        row.serverPredictedSeconds !== undefined &&
        row.serverPredictedSeconds > 0,
    );
    const serverPromptRows = okRows.filter(
      (row) =>
        row.serverPromptTokens !== undefined && row.serverPromptSeconds !== undefined && row.serverPromptSeconds > 0,
    );
    const weightedRate = (rows: SweReportRow[], tokens: number[], seconds: number[]): number | undefined => {
      if (rows.length === 0) return undefined;
      const totalTokens = tokens.reduce((sum, value) => sum + value, 0);
      const totalSeconds = seconds.reduce((sum, value) => sum + value, 0);
      return totalSeconds > 0 ? totalTokens / totalSeconds : undefined;
    };
    const fallbackDecodeRates = okRows.flatMap((row) => {
      if (row.serverPredictedTokens !== undefined) return []; // already covered by server metrics
      if (row.outputTokens === undefined || row.latencyMs === undefined || row.latencyMs <= 0) return [];
      return [row.outputTokens / (row.latencyMs / 1000)];
    });
    const avgDecodeTokensPerSec =
      weightedRate(
        serverPredictedRows,
        serverPredictedRows.map((row) => row.serverPredictedTokens!),
        serverPredictedRows.map((row) => row.serverPredictedSeconds!),
      ) ?? average(fallbackDecodeRates);
    const avgPromptTokensPerSec = weightedRate(
      serverPromptRows,
      serverPromptRows.map((row) => row.serverPromptTokens!),
      serverPromptRows.map((row) => row.serverPromptSeconds!),
    );

    const reviewRows = okRows.filter((row) => row.reviewMetrics !== undefined);
    const recalls = reviewRows.flatMap((row) =>
      row.reviewMetrics?.recall === undefined ? [] : [row.reviewMetrics.recall],
    );
    const precisions = reviewRows.flatMap((row) =>
      row.reviewMetrics?.precision === undefined ? [] : [row.reviewMetrics.precision],
    );
    const f1s = reviewRows.flatMap((row) =>
      row.reviewMetrics?.f1 === undefined ? [] : [row.reviewMetrics.f1],
    );

    const verifyPassRatesByTask = new Map<string, number[]>();
    for (const row of okRows) if (row.verifyPassRate !== undefined) {
      const rates = verifyPassRatesByTask.get(row.taskId) ?? []; rates.push(row.verifyPassRate); verifyPassRatesByTask.set(row.taskId, rates);
    }
    const taskVerifyPassRates = [...verifyPassRatesByTask.values()].flatMap((rates) => {
      const value = average(rates); return value === undefined ? [] : [value];
    });
    const byTask = new Map<string, SweReportRow[]>();
    for (const row of intentionRows) { const list = byTask.get(row.taskId) ?? []; list.push(row); byTask.set(row.taskId, list); }
    const orderedTasks = [...byTask.values()].map((taskRows) => taskRows.sort((a, b) => a.repeatIndex - b.repeatIndex));
    const passAt1 = average(orderedTasks.map((taskRows) => taskRows[0]!.verifyPassed === true ? 1 : 0));
    const repeatedTrialSolveRate = average(orderedTasks.map((taskRows) => taskRows.some((row) => row.verifyPassed === true) ? 1 : 0));
    const repeatsObserved = Math.max(0, ...orderedTasks.map((taskRows) => taskRows.length));
    const unstableTestCountTasks = [...byTask.values()].filter((taskRows) =>
      new Set(taskRows.flatMap((row) => row.verifyTestsTotal === undefined ? [] : [row.verifyTestsTotal])).size > 1,
    ).length;

    return {
      harnessModelId,
      totalRuns: cellRows.length,
      okRuns: okRows.length,
      errorRuns: cellRows.length - okRows.length,
      passedRuns,
      failedRuns,
      passRate: verifiedTotal > 0 ? passedRuns / verifiedTotal : undefined,
      intentionToEvaluatePassRate: intentionRows.length > 0 ? passedRuns / intentionRows.length : undefined,
      cleanPassedRuns,
      verifiedTimedOutRuns,
      cleanPassRate: verifiedTotal > 0 ? cleanPassedRuns / verifiedTotal : undefined,
      avgJudgeScore: average(judgeScores),
      medianJudgeScore: median(judgeScores),
      selfScoreAvg: average(selfRunScores),
      avgAgentLatencyMs: average(latencies),
      avgDiffLines: average(diffLines),
      timeouts,
      avgDecodeTokensPerSec,
      avgPromptTokensPerSec,
      avgRecall: average(recalls),
      avgPrecision: average(precisions),
      avgF1: average(f1s),
      reviewRuns: reviewRows.length,
      avgVerifyPassRate: average(taskVerifyPassRates),
      passAt1,
      repeatedTrialSolveRate,
      repeatsObserved,
      intentionToEvaluateRuns: intentionRows.length,
      infrastructureFailures: cellRows.filter((row) => row.outcomeCategory && infrastructure.has(row.outcomeCategory)).length,
      candidateFailures: intentionRows.filter((row) => row.outcomeCategory === "candidate_failure" || row.outcomeCategory === "timeout").length,
      invalidOutputs: intentionRows.filter((row) => row.outcomeCategory === "invalid_output").length,
      publicationBlockedRuns: cellRows.length - comparableRows.length,
      unstableTestCountTasks,
    };
  });
}

export function querySweReportData(db: Database, options: QuerySweOptions & { runIds?: number[] } = {}): SweReportData {
  let sql = `
    SELECT runs.*, swe_results.task_type, swe_results.workdir, swe_results.baseline_sha, swe_results.diff_patch,
           swe_results.files_changed, swe_results.lines_added, swe_results.lines_removed,
           swe_results.transcript, swe_results.agent_exit_code, swe_results.agent_timed_out,
           swe_results.verify_command, swe_results.verify_exit_code, swe_results.verify_passed,
           swe_results.verify_output, swe_results.verify_duration_ms, swe_results.review_metrics,
           swe_results.server_prompt_tokens, swe_results.server_prompt_seconds,
           swe_results.server_predicted_tokens, swe_results.server_predicted_seconds,
           swe_results.verify_tests_passed, swe_results.verify_tests_total,
           swe_results.verification_detail, swe_results.outcome_category, swe_results.publication_status,
           swe_results.environment_fingerprint
    FROM runs
    LEFT JOIN swe_results ON swe_results.run_id = runs.id
    WHERE runs.kind = 'swe'
  `;
  const params: Record<string, string> = {};
  if (options.runBatchId) {
    sql += " AND runs.run_batch_id = $runBatchId";
    params.$runBatchId = options.runBatchId;
  }
  if (options.runIds) {
    if (options.runIds.length === 0) sql += " AND 0";
    else sql += ` AND runs.id IN (${options.runIds.map((id) => Number(id)).join(",")})`;
  }
  sql += " ORDER BY runs.prompt_id, runs.model_id, runs.started_at ASC";

  const allRows = (db.query(sql).all(params) as any[]).map(rowToSweReportRow);

  const scoreRows = db
    .query(
      `
        SELECT run_id, judge_model_id, score, rationale,
               error AS judge_error, status AS judge_status, scored_at,
               dimension_scores, weighted_score
        FROM scores
        ORDER BY judge_model_id ASC, scored_at ASC
      `,
    )
    .all() as any[];
  const scoresByRun = new Map<number, JudgeReportRow[]>();
  for (const scoreRow of scoreRows) {
    const list = scoresByRun.get(scoreRow.run_id) ?? [];
    list.push({
      judgeModelId: scoreRow.judge_model_id,
      score: scoreRow.score ?? undefined,
      rationale: scoreRow.rationale ?? undefined,
      judgeError: scoreRow.judge_error ?? undefined,
      judgeStatus: scoreRow.judge_status,
      scoredAt: scoreRow.scored_at,
      dimensions: scoreRow.dimension_scores ? JSON.parse(scoreRow.dimension_scores) : undefined,
      weightedScore: scoreRow.weighted_score ?? undefined,
    });
    scoresByRun.set(scoreRow.run_id, list);
  }
  for (const row of allRows) {
    row.judgeResults = scoresByRun.get(row.runId) ?? [];
  }

  const latestBatchByCell = new Map<string, string>();
  for (const row of allRows) latestBatchByCell.set(`${row.taskId}\0${row.harnessModelId}`, row.runBatchId);
  const selectedRows = options.allRuns || options.runBatchId
    ? allRows
    : allRows.filter((row) => latestBatchByCell.get(`${row.taskId}\0${row.harnessModelId}`) === row.runBatchId);

  const grouped = new Map<string, Map<string, SweReportRow[]>>();
  for (const row of selectedRows) {
    // Quarantined evidence contributes only to publication-blocking/reliability counts,
    // never task details or correctness headlines.
    if (row.publicationStatus !== "comparable") continue;
    let byModel = grouped.get(row.taskId);
    if (!byModel) {
      byModel = new Map();
      grouped.set(row.taskId, byModel);
    }
    const list = byModel.get(row.harnessModelId) ?? [];
    list.push(row);
    byModel.set(row.harnessModelId, list);
  }

  const taskIds = [...grouped.keys()].sort();
  const harnessModelIdSet = new Set<string>();
  for (const row of selectedRows) harnessModelIdSet.add(row.harnessModelId);
  for (const byModel of grouped.values()) {
    for (const harnessModelId of byModel.keys()) harnessModelIdSet.add(harnessModelId);
  }
  const harnessModelIds = [...harnessModelIdSet].sort();

  const infrastructure = new Set<SweOutcomeCategory>(["harness_error", "verifier_error", "judge_error"]);
  const statisticalTrials = selectedRows
    .filter((row) => row.taskType !== "code-review" && row.publicationStatus === "comparable")
    .map((row) => ({
      taskId: row.taskId,
      modelId: row.harnessModelId,
      repeatIndex: row.repeatIndex,
      outcome: (row.verifyPassed === true || row.outcomeCategory === "passed") ? 1 as const : 0 as const,
      infrastructureFailure: row.outcomeCategory ? infrastructure.has(row.outcomeCategory) : row.runStatus === "error",
      judgeScore: median(peerScoresForSweRow(row)),
      environmentFingerprint: row.environmentFingerprint,
      provenanceId: row.experimentId ?? row.runBatchId,
    }));
  const statisticalAnalysis = analyzePairedTrials(statisticalTrials);
  const experimentRows = db.query("SELECT id, manifest_json FROM experiments").all() as Array<{ id: string; manifest_json: string }>;
  const manifests = new Map(experimentRows.map((row) => [row.id, JSON.parse(row.manifest_json)]));
  const harnessComparisons: HarnessComparison[] = [];
  for (const [experimentId, manifest] of manifests) {
    const paired = manifest.harness?.config?.pairedExperiment;
    if (!paired) continue;
    const experimentData = selectedRows.filter((row) => row.experimentId === experimentId && row.publicationStatus === "comparable");
    const raw = paired.cells.find((cell: any) => cell.harnessId === "raw-api");
    if (!raw) continue;
    for (const agent of paired.cells.filter((cell: any) => cell.harnessId !== "raw-api")) {
      const baselineId = `${raw.harnessId}:${raw.modelAlias}`, candidateId = `${agent.harnessId}:${agent.modelAlias}`;
      const baseline = experimentData.filter((row) => row.harnessModelId === baselineId), candidate = experimentData.filter((row) => row.harnessModelId === candidateId);
      const taskIds = [...new Set(baseline.map((row) => row.taskId).filter((id) => candidate.some((row) => row.taskId === id)))];
      const definitions: Array<[HarnessMetricDelta["metric"], (row: SweReportRow) => number | undefined]> = [
        ["correctness", (row) => row.verifyPassed === true ? 1 : row.outcomeCategory && !["harness_error", "verifier_error", "judge_error"].includes(row.outcomeCategory) ? 0 : undefined],
        ["latencyMs", (row) => row.latencyMs], ["costUsd", (row) => row.costUsd],
        ["diffLines", (row) => row.linesAdded === undefined && row.linesRemoved === undefined ? undefined : (row.linesAdded ?? 0) + (row.linesRemoved ?? 0)],
        ["judgeScore", (row) => median(peerScoresForSweRow(row))],
      ];
      const metrics = definitions.map(([metric, value]): HarnessMetricDelta => {
        const pairs = taskIds.flatMap((taskId) => {
          const a = baseline.filter((row) => row.taskId === taskId).map(value).filter((v): v is number => v !== undefined);
          const b = candidate.filter((row) => row.taskId === taskId).map(value).filter((v): v is number => v !== undefined);
          return a.length && b.length ? [{ baseline: a, candidate: b }] : [];
        });
        if (!pairs.length) return { metric, matchedTasks: 0 };
        const taskDeltas = pairs.map((pair) => average(pair.candidate)! - average(pair.baseline)!);
        return { metric, matchedTasks: pairs.length, delta: average(taskDeltas), interval: hierarchicalBootstrapDelta(pairs) };
      });
      harnessComparisons.push({ experimentId, underlyingModel: paired.underlyingModel, baselineId, candidateId, kind: paired.kind, excluded: paired.kind !== "harness-effect", reasons: paired.exclusions ?? [], metrics });
    }
  }
  return { taskIds, harnessModelIds, rows: grouped, summaries: summarizeSwe(harnessModelIds, selectedRows), statisticalAnalysis, statisticalTrials, harnessComparisons };
}
