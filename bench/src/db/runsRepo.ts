import type { Database } from "bun:sqlite";

export interface RunRecord {
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
  rawResponse?: string;
  error?: string;
  status: "ok" | "error";
}

export interface RunRow extends RunRecord {
  id: number;
}

export function insertRun(db: Database, record: RunRecord): number {
  const stmt = db.prepare(`
    INSERT INTO runs (
      run_batch_id, prompt_id, provider_id, model_id, model_name, started_at,
      latency_ms, input_tokens, output_tokens, output_text, raw_response, error, status
    ) VALUES (
      $runBatchId, $promptId, $providerId, $modelId, $modelName, $startedAt,
      $latencyMs, $inputTokens, $outputTokens, $outputText, $rawResponse, $error, $status
    )
  `);

  const result = stmt.run({
    $runBatchId: record.runBatchId,
    $promptId: record.promptId,
    $providerId: record.providerId,
    $modelId: record.modelId,
    $modelName: record.modelName,
    $startedAt: record.startedAt,
    $latencyMs: record.latencyMs ?? null,
    $inputTokens: record.inputTokens ?? null,
    $outputTokens: record.outputTokens ?? null,
    $outputText: record.outputText ?? null,
    $rawResponse: record.rawResponse ?? null,
    $error: record.error ?? null,
    $status: record.status,
  });

  return Number(result.lastInsertRowid);
}

export function getRunsForBatch(db: Database, runBatchId: string): RunRow[] {
  const rows = db
    .query("SELECT * FROM runs WHERE run_batch_id = $runBatchId")
    .all({ $runBatchId: runBatchId }) as any[];
  return rows.map(rowToRunRow);
}

function rowToRunRow(row: any): RunRow {
  return {
    id: row.id,
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
    rawResponse: row.raw_response ?? undefined,
    error: row.error ?? undefined,
    status: row.status,
  };
}
