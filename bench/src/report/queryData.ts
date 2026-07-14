import type { Database } from "bun:sqlite";

export interface ReportRow {
  runId: number;
  runBatchId: string;
  promptId: string;
  providerId: string;
  modelId: string;
  modelName: string;
  startedAt: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  outputText?: string;
  error?: string;
  runStatus: "ok" | "error";
  judgeResults: JudgeReportRow[];
  score?: number;
  rationale?: string;
  judgeModelId?: string;
  judgeError?: string;
  judgeStatus?: "ok" | "error";
  scoredAt?: string;
}

export interface JudgeReportRow {
  judgeModelId: string;
  score?: number;
  rationale?: string;
  judgeError?: string;
  judgeStatus: "ok" | "error";
  scoredAt: string;
}

export interface ModelSummary {
  modelId: string;
  okRuns: number;
  errorRuns: number;
  missingJudgeScores: number;
  avgScore?: number;
  avgLatencyMs?: number;
  medianLatencyMs?: number;
  avgOutputTokens?: number;
  avgJudgeSpread?: number;
  qualityPerSecond?: number;
}

export interface ReportData {
  promptIds: string[];
  modelIds: string[];
  // rows[promptId][modelId] -> ReportRow[] (sorted oldest -> newest)
  rows: Map<string, Map<string, ReportRow[]>>;
  summaries: ModelSummary[];
}

export interface QueryOptions {
  runBatchId?: string;
  allRuns?: boolean;
}

function rowToReportRow(row: any): ReportRow {
  return {
    runId: row.id,
    runBatchId: row.run_batch_id,
    promptId: row.prompt_id,
    providerId: row.provider_id,
    modelId: row.model_id,
    modelName: row.model_name,
    startedAt: row.started_at,
    latencyMs: row.latency_ms ?? undefined,
    inputTokens: row.input_tokens ?? undefined,
    outputTokens: row.output_tokens ?? undefined,
    outputText: row.output_text ?? undefined,
    error: row.error ?? undefined,
    runStatus: row.status,
    judgeResults: [],
  };
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function summarize(modelIds: string[], rows: ReportRow[]): ModelSummary[] {
  return modelIds.map((modelId) => {
    const modelRows = rows.filter((row) => row.modelId === modelId);
    const okRows = modelRows.filter((row) => row.runStatus === "ok");
    const runScores = okRows.flatMap((row) => {
      const scores = row.judgeResults.flatMap((judge) =>
        judge.score === undefined ? [] : [judge.score],
      );
      const runAverage = average(scores);
      return runAverage === undefined ? [] : [runAverage];
    });
    const missingJudgeScores = okRows.reduce(
      (sum, row) =>
        sum + row.judgeResults.filter((judge) => judge.judgeStatus !== "ok" || judge.score === undefined).length,
      0,
    );
    const latencies = okRows.flatMap((row) =>
      row.latencyMs === undefined ? [] : [row.latencyMs],
    );
    const outputTokens = okRows.flatMap((row) =>
      row.outputTokens === undefined ? [] : [row.outputTokens],
    );
    const spreads = okRows.flatMap((row) => {
      const rowScores = row.judgeResults.flatMap((judge) =>
        judge.score === undefined ? [] : [judge.score],
      );
      if (rowScores.length < 2) return [];
      return [Math.max(...rowScores) - Math.min(...rowScores)];
    });
    const avgScore = average(runScores);
    const avgLatencyMs = average(latencies);
    return {
      modelId,
      okRuns: okRows.length,
      errorRuns: modelRows.length - okRows.length,
      missingJudgeScores,
      avgScore,
      avgLatencyMs,
      medianLatencyMs: median(latencies),
      avgOutputTokens: average(outputTokens),
      avgJudgeSpread: average(spreads),
      qualityPerSecond:
        avgScore !== undefined && avgLatencyMs !== undefined && avgLatencyMs > 0
          ? avgScore / (avgLatencyMs / 1000)
          : undefined,
    };
  });
}

export function queryReportData(db: Database, options: QueryOptions = {}): ReportData {
  let sql = "SELECT runs.* FROM runs";
  const params: Record<string, string> = {};
  if (options.runBatchId) {
    sql += " WHERE runs.run_batch_id = $runBatchId";
    params.$runBatchId = options.runBatchId;
  }
  sql += " ORDER BY runs.prompt_id, runs.model_id, runs.started_at ASC";

  const allRows = (db.query(sql).all(params) as any[]).map(rowToReportRow);
  const scoreRows = db
    .query(
      `
        SELECT run_id, judge_model_id, score, rationale,
               error AS judge_error, status AS judge_status, scored_at
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
    });
    scoresByRun.set(scoreRow.run_id, list);
  }
  for (const row of allRows) {
    row.judgeResults = scoresByRun.get(row.runId) ?? [];
    const firstJudge = row.judgeResults[0];
    row.score = firstJudge?.score;
    row.rationale = firstJudge?.rationale;
    row.judgeModelId = firstJudge?.judgeModelId;
    row.judgeError = firstJudge?.judgeError;
    row.judgeStatus = firstJudge?.judgeStatus;
    row.scoredAt = firstJudge?.scoredAt;
  }

  const grouped = new Map<string, Map<string, ReportRow[]>>();
  for (const row of allRows) {
    let byModel = grouped.get(row.promptId);
    if (!byModel) {
      byModel = new Map();
      grouped.set(row.promptId, byModel);
    }
    const list = byModel.get(row.modelId) ?? [];
    list.push(row);
    byModel.set(row.modelId, list);
  }

  if (!options.allRuns) {
    for (const byModel of grouped.values()) {
      for (const [modelId, list] of byModel) {
        byModel.set(modelId, [list[list.length - 1]!]);
      }
    }
  }

  const promptIds = [...grouped.keys()].sort();
  const modelIdSet = new Set<string>();
  for (const byModel of grouped.values()) {
    for (const modelId of byModel.keys()) modelIdSet.add(modelId);
  }

  const modelIds = [...modelIdSet].sort();
  const latestRows = [...grouped.values()].flatMap((byModel) =>
    [...byModel.values()].flatMap((rows) => rows),
  );

  return { promptIds, modelIds, rows: grouped, summaries: summarize(modelIds, latestRows) };
}
