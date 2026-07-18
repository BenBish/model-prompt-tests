import type { Database } from "bun:sqlite";

export interface JudgeDimensionReportScore {
  score: number;
  rationale: string;
}

export interface ReportRow {
  runId: number;
  runBatchId: string;
  promptId: string;
  providerId: string;
  modelId: string;
  modelName: string;
  startedAt: string;
  repeatIndex: number;
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
  dimensions?: Record<string, JudgeDimensionReportScore>;
  weightedScore?: number;
}

export interface ModelSummary {
  modelId: string;
  okRuns: number;
  errorRuns: number;
  missingJudgeScores: number;
  avgScore?: number;
  medianScore?: number;
  scoreStdDev?: number;
  /** Mean of per-cell score stddevs across repeats. Only meaningful when repeats > 1. */
  repeatVariance?: number;
  /** Share of judged runs (with >=2 judges) where every judge gave the identical integer score. */
  judgeAgreementPct?: number;
  avgLatencyMs?: number;
  medianLatencyMs?: number;
  avgOutputTokens?: number;
  avgJudgeSpread?: number;
  dimensionAverages?: Record<string, number>;
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

function parseDimensionScores(
  raw: string | null,
): Record<string, JudgeDimensionReportScore> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    console.error(`[warn] ignoring malformed dimension_scores JSON: ${raw}`);
    return undefined;
  }
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
    repeatIndex: row.repeat_index ?? 0,
    latencyMs: row.latency_ms ?? undefined,
    inputTokens: row.input_tokens ?? undefined,
    outputTokens: row.output_tokens ?? undefined,
    outputText: row.output_text ?? undefined,
    error: row.error ?? undefined,
    runStatus: row.status,
    judgeResults: [],
  };
}

export function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function stddev(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  if (values.length === 1) return 0;
  const mean = average(values)!;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** A single run's judge scores, collapsed to one number so repeats/judges aggregate consistently. */
export function judgeScoresForRow(row: ReportRow): number[] {
  return row.judgeResults.flatMap((judge) => (judge.score === undefined ? [] : [judge.score]));
}

export function perRunMedianScore(row: ReportRow): number | undefined {
  return median(judgeScoresForRow(row));
}

function summarize(modelIds: string[], rows: ReportRow[]): ModelSummary[] {
  return modelIds.map((modelId) => {
    const modelRows = rows.filter((row) => row.modelId === modelId);
    const okRows = modelRows.filter((row) => row.runStatus === "ok");

    // Group ok rows into (prompt) cells so repeats are aggregated before they hit the model average.
    const cellRows = new Map<string, ReportRow[]>();
    for (const row of okRows) {
      const list = cellRows.get(row.promptId) ?? [];
      list.push(row);
      cellRows.set(row.promptId, list);
    }

    const runScores: number[] = [];
    const cellScores: number[] = [];
    const cellStdDevs: number[] = [];
    for (const cellRowList of cellRows.values()) {
      const perRunScores = cellRowList.flatMap((row) => {
        const score = perRunMedianScore(row);
        return score === undefined ? [] : [score];
      });
      runScores.push(...perRunScores);
      const cellMedian = median(perRunScores);
      if (cellMedian !== undefined) cellScores.push(cellMedian);
      if (perRunScores.length > 1) {
        const cellStdDev = stddev(perRunScores);
        if (cellStdDev !== undefined) cellStdDevs.push(cellStdDev);
      }
    }

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
      const rowScores = judgeScoresForRow(row);
      if (rowScores.length < 2) return [];
      return [Math.max(...rowScores) - Math.min(...rowScores)];
    });

    const agreementEligibleRows = okRows.filter((row) => judgeScoresForRow(row).length >= 2);
    const agreeingRows = agreementEligibleRows.filter(
      (row) => new Set(judgeScoresForRow(row)).size === 1,
    );

    const dimensionTotals = new Map<string, { sum: number; count: number }>();
    for (const row of okRows) {
      for (const judge of row.judgeResults) {
        if (!judge.dimensions) continue;
        for (const [dimensionId, dimensionScore] of Object.entries(judge.dimensions)) {
          const entry = dimensionTotals.get(dimensionId) ?? { sum: 0, count: 0 };
          entry.sum += dimensionScore.score;
          entry.count += 1;
          dimensionTotals.set(dimensionId, entry);
        }
      }
    }
    const dimensionAverages: Record<string, number> = Object.fromEntries(
      [...dimensionTotals.entries()].map(([id, { sum, count }]) => [id, sum / count]),
    );

    const avgScore = average(cellScores);
    const avgLatencyMs = average(latencies);

    return {
      modelId,
      okRuns: okRows.length,
      errorRuns: modelRows.length - okRows.length,
      missingJudgeScores,
      avgScore,
      medianScore: median(cellScores),
      scoreStdDev: stddev(runScores),
      repeatVariance: cellStdDevs.length > 0 ? average(cellStdDevs) : undefined,
      judgeAgreementPct:
        agreementEligibleRows.length > 0 ? agreeingRows.length / agreementEligibleRows.length : undefined,
      avgLatencyMs,
      medianLatencyMs: median(latencies),
      avgOutputTokens: average(outputTokens),
      avgJudgeSpread: average(spreads),
      dimensionAverages: Object.keys(dimensionAverages).length > 0 ? dimensionAverages : undefined,
      qualityPerSecond:
        avgScore !== undefined && avgLatencyMs !== undefined && avgLatencyMs > 0
          ? avgScore / (avgLatencyMs / 1000)
          : undefined,
    };
  });
}

export function queryReportData(db: Database, options: QueryOptions = {}): ReportData {
  let sql = "SELECT runs.* FROM runs WHERE runs.kind = 'prompt'";
  const params: Record<string, string> = {};
  if (options.runBatchId) {
    sql += " AND runs.run_batch_id = $runBatchId";
    params.$runBatchId = options.runBatchId;
  }
  sql += " ORDER BY runs.prompt_id, runs.model_id, runs.started_at ASC";

  const allRows = (db.query(sql).all(params) as any[]).map(rowToReportRow);
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
      dimensions: parseDimensionScores(scoreRow.dimension_scores),
      weightedScore: scoreRow.weighted_score ?? undefined,
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
        const latestBatchId = list[list.length - 1]!.runBatchId;
        byModel.set(
          modelId,
          list.filter((row) => row.runBatchId === latestBatchId),
        );
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
