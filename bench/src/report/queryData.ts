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
  score?: number;
  rationale?: string;
  judgeModelId?: string;
}

export interface ReportData {
  promptIds: string[];
  modelIds: string[];
  // rows[promptId][modelId] -> ReportRow[] (sorted oldest -> newest)
  rows: Map<string, Map<string, ReportRow[]>>;
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
    score: row.score ?? undefined,
    rationale: row.rationale ?? undefined,
    judgeModelId: row.judge_model_id ?? undefined,
  };
}

export function queryReportData(db: Database, options: QueryOptions = {}): ReportData {
  let sql = `
    SELECT runs.*, scores.score, scores.rationale, scores.judge_model_id
    FROM runs
    LEFT JOIN scores ON scores.run_id = runs.id
  `;
  const params: Record<string, string> = {};
  if (options.runBatchId) {
    sql += " WHERE runs.run_batch_id = $runBatchId";
    params.$runBatchId = options.runBatchId;
  }
  sql += " ORDER BY runs.prompt_id, runs.model_id, runs.started_at ASC";

  const allRows = (db.query(sql).all(params) as any[]).map(rowToReportRow);

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

  return { promptIds, modelIds: [...modelIdSet].sort(), rows: grouped };
}
