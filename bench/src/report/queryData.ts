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
  stopReason?: string;
  costUsd?: number;
  judgeResults: JudgeReportRow[];
  score?: number;
  rationale?: string;
  judgeModelId?: string;
  judgeError?: string;
  judgeStatus?: "ok" | "error";
  scoredAt?: string;
}

const TRUNCATION_STOP_REASONS = new Set(["length", "max_tokens", "max_output_tokens"]);

function isTruncated(stopReason: string | undefined): boolean {
  return stopReason !== undefined && TRUNCATION_STOP_REASONS.has(stopReason);
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
  /** Headline average: peer judges only (self-judging excluded). */
  avgScore?: number;
  medianScore?: number;
  scoreStdDev?: number;
  /** Mean of per-cell score stddevs across repeats. Only meaningful when repeats > 1. */
  repeatVariance?: number;
  /** Share of judged runs (with >=2 peer judges) where every peer judge gave the identical integer score. */
  judgeAgreementPct?: number;
  /** Mean of self-judge scores when a model scored its own output. Not blended into avgScore. */
  selfScoreAvg?: number;
  avgLatencyMs?: number;
  medianLatencyMs?: number;
  avgOutputTokens?: number;
  avgJudgeSpread?: number;
  dimensionAverages?: Record<string, number>;
  qualityPerSecond?: number;
  totalCostUsd?: number;
  avgCostUsd?: number;
  qualityPerDollar?: number;
  truncatedRuns: number;
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
    stopReason: row.stop_reason ?? undefined,
    costUsd: row.cost_usd ?? undefined,
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

/** Peer (non-self) judge scores for a run. Headline aggregates use only these. */
export function peerScores(row: ReportRow): number[] {
  return row.judgeResults.flatMap((judge) =>
    judge.score === undefined || judge.judgeModelId === row.modelId ? [] : [judge.score],
  );
}

/** Self-judge scores where the judge model is the same as the candidate. */
export function selfScores(row: ReportRow): number[] {
  return row.judgeResults.flatMap((judge) =>
    judge.score === undefined || judge.judgeModelId !== row.modelId ? [] : [judge.score],
  );
}

/**
 * A single run's peer judge scores. Self-judging is excluded so a model that
 * also judges cannot inflate its own headline score.
 */
export function judgeScoresForRow(row: ReportRow): number[] {
  return peerScores(row);
}

export function perRunMedianScore(row: ReportRow): number | undefined {
  return median(peerScores(row));
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

    const selfRunScores = okRows.flatMap((row) => {
      const runSelf = average(selfScores(row));
      return runSelf === undefined ? [] : [runSelf];
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
    const costs = okRows.flatMap((row) => (row.costUsd === undefined ? [] : [row.costUsd]));
    const truncatedRuns = okRows.filter((row) => isTruncated(row.stopReason)).length;
    const spreads = okRows.flatMap((row) => {
      const rowScores = peerScores(row);
      if (rowScores.length < 2) return [];
      return [Math.max(...rowScores) - Math.min(...rowScores)];
    });

    const agreementEligibleRows = okRows.filter((row) => peerScores(row).length >= 2);
    const agreeingRows = agreementEligibleRows.filter(
      (row) => new Set(peerScores(row)).size === 1,
    );

    // Dimension averages from peer judges only (same inflation defense as overall scores).
    const dimensionTotals = new Map<string, { sum: number; count: number }>();
    for (const row of okRows) {
      for (const judge of row.judgeResults) {
        if (!judge.dimensions) continue;
        if (judge.judgeModelId === row.modelId) continue;
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
    const avgCostUsd = average(costs);

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
      selfScoreAvg: average(selfRunScores),
      avgLatencyMs,
      medianLatencyMs: median(latencies),
      avgOutputTokens: average(outputTokens),
      avgJudgeSpread: average(spreads),
      dimensionAverages: Object.keys(dimensionAverages).length > 0 ? dimensionAverages : undefined,
      qualityPerSecond:
        avgScore !== undefined && avgLatencyMs !== undefined && avgLatencyMs > 0
          ? avgScore / (avgLatencyMs / 1000)
          : undefined,
      totalCostUsd: costs.length > 0 ? costs.reduce((sum, cost) => sum + cost, 0) : undefined,
      avgCostUsd,
      qualityPerDollar:
        avgScore !== undefined && avgCostUsd !== undefined && avgCostUsd > 0
          ? avgScore / avgCostUsd
          : undefined,
      truncatedRuns,
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
