import type { Database } from "bun:sqlite";
import { average, median, type JudgeReportRow } from "../report/queryData";

export interface SweReportRow {
  runId: number;
  runBatchId: string;
  taskId: string;
  harnessId: string;
  modelAlias: string;
  harnessModelId: string;
  startedAt: string;
  repeatIndex: number;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
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
  /** Peer judges only (self-judging excluded). */
  avgJudgeScore?: number;
  medianJudgeScore?: number;
  /** Mean of self-judge scores when present; not blended into avgJudgeScore. */
  selfScoreAvg?: number;
  avgAgentLatencyMs?: number;
  avgDiffLines?: number;
  timeouts: number;
}

export interface SweReportData {
  taskIds: string[];
  harnessModelIds: string[];
  rows: Map<string, Map<string, SweReportRow[]>>;
  summaries: SweSummary[];
}

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
  return {
    runId: row.id,
    runBatchId: row.run_batch_id,
    taskId: row.prompt_id,
    harnessId,
    modelAlias,
    harnessModelId: row.model_id,
    startedAt: row.started_at,
    repeatIndex: row.repeat_index ?? 0,
    latencyMs: row.latency_ms ?? undefined,
    inputTokens: row.input_tokens ?? undefined,
    outputTokens: row.output_tokens ?? undefined,
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
    judgeResults: [],
  };
}

/** Peer (non-self) judge scores for a SWE run. */
function peerScoresForSweRow(row: SweReportRow): number[] {
  return row.judgeResults.flatMap((judge) =>
    judge.score === undefined || judge.judgeModelId === row.harnessModelId ? [] : [judge.score],
  );
}

function selfScoresForSweRow(row: SweReportRow): number[] {
  return row.judgeResults.flatMap((judge) =>
    judge.score === undefined || judge.judgeModelId !== row.harnessModelId ? [] : [judge.score],
  );
}

function summarizeSwe(harnessModelIds: string[], rows: SweReportRow[]): SweSummary[] {
  return harnessModelIds.map((harnessModelId) => {
    const cellRows = rows.filter((row) => row.harnessModelId === harnessModelId);
    const okRows = cellRows.filter((row) => row.runStatus === "ok");
    const passedRuns = okRows.filter((row) => row.verifyPassed === true).length;
    const failedRuns = okRows.filter((row) => row.verifyPassed === false).length;
    const verifiedTotal = passedRuns + failedRuns;

    // Headline judge scores exclude self-judging (judge model == candidate harness:model).
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

    return {
      harnessModelId,
      totalRuns: cellRows.length,
      okRuns: okRows.length,
      errorRuns: cellRows.length - okRows.length,
      passedRuns,
      failedRuns,
      passRate: verifiedTotal > 0 ? passedRuns / verifiedTotal : undefined,
      avgJudgeScore: average(judgeScores),
      medianJudgeScore: median(judgeScores),
      selfScoreAvg: average(selfRunScores),
      avgAgentLatencyMs: average(latencies),
      avgDiffLines: average(diffLines),
      timeouts,
    };
  });
}

export function querySweReportData(db: Database, options: QuerySweOptions = {}): SweReportData {
  let sql = `
    SELECT runs.*, swe_results.workdir, swe_results.baseline_sha, swe_results.diff_patch,
           swe_results.files_changed, swe_results.lines_added, swe_results.lines_removed,
           swe_results.transcript, swe_results.agent_exit_code, swe_results.agent_timed_out,
           swe_results.verify_command, swe_results.verify_exit_code, swe_results.verify_passed,
           swe_results.verify_output, swe_results.verify_duration_ms
    FROM runs
    LEFT JOIN swe_results ON swe_results.run_id = runs.id
    WHERE runs.kind = 'swe'
  `;
  const params: Record<string, string> = {};
  if (options.runBatchId) {
    sql += " AND runs.run_batch_id = $runBatchId";
    params.$runBatchId = options.runBatchId;
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

  const grouped = new Map<string, Map<string, SweReportRow[]>>();
  for (const row of allRows) {
    let byModel = grouped.get(row.taskId);
    if (!byModel) {
      byModel = new Map();
      grouped.set(row.taskId, byModel);
    }
    const list = byModel.get(row.harnessModelId) ?? [];
    list.push(row);
    byModel.set(row.harnessModelId, list);
  }

  if (!options.allRuns) {
    for (const byModel of grouped.values()) {
      for (const [harnessModelId, list] of byModel) {
        const latestBatchId = list[list.length - 1]!.runBatchId;
        byModel.set(
          harnessModelId,
          list.filter((row) => row.runBatchId === latestBatchId),
        );
      }
    }
  }

  const taskIds = [...grouped.keys()].sort();
  const harnessModelIdSet = new Set<string>();
  for (const byModel of grouped.values()) {
    for (const harnessModelId of byModel.keys()) harnessModelIdSet.add(harnessModelId);
  }
  const harnessModelIds = [...harnessModelIdSet].sort();

  const flatRows = [...grouped.values()].flatMap((byModel) => [...byModel.values()].flatMap((rows) => rows));

  return { taskIds, harnessModelIds, rows: grouped, summaries: summarizeSwe(harnessModelIds, flatRows) };
}
