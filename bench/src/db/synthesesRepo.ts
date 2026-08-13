import type { Database } from "bun:sqlite";

export interface SynthesisRecord {
  runBatchId: string;
  promptId: string;
  repeatIndex: number;
  chairmanModelId: string;
  /** Chairman's synthesized answer, when ok. */
  synthesisText?: string;
  /** JSON provenance: candidate ids, optional peer-rank order, chairman notes. */
  provenance?: string;
  rawOutput?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  status: "ok" | "error";
  error?: string;
  synthesizedAt: string;
}

export interface SynthesisRow extends SynthesisRecord {
  id: number;
}

export function insertSynthesis(db: Database, record: SynthesisRecord): number {
  const stmt = db.prepare(`
    INSERT INTO syntheses (
      run_batch_id, prompt_id, repeat_index, chairman_model_id,
      synthesis_text, provenance, raw_output,
      latency_ms, input_tokens, output_tokens, cost_usd,
      status, error, synthesized_at
    ) VALUES (
      $runBatchId, $promptId, $repeatIndex, $chairmanModelId,
      $synthesisText, $provenance, $rawOutput,
      $latencyMs, $inputTokens, $outputTokens, $costUsd,
      $status, $error, $synthesizedAt
    )
  `);

  const result = stmt.run({
    $runBatchId: record.runBatchId,
    $promptId: record.promptId,
    $repeatIndex: record.repeatIndex,
    $chairmanModelId: record.chairmanModelId,
    $synthesisText: record.synthesisText ?? null,
    $provenance: record.provenance ?? null,
    $rawOutput: record.rawOutput ?? null,
    $latencyMs: record.latencyMs ?? null,
    $inputTokens: record.inputTokens ?? null,
    $outputTokens: record.outputTokens ?? null,
    $costUsd: record.costUsd ?? null,
    $status: record.status,
    $error: record.error ?? null,
    $synthesizedAt: record.synthesizedAt,
  });

  return Number(result.lastInsertRowid);
}

export function getSynthesesForBatch(db: Database, runBatchId: string): SynthesisRow[] {
  const rows = db
    .query(
      `SELECT * FROM syntheses WHERE run_batch_id = $runBatchId ORDER BY prompt_id, repeat_index, id`,
    )
    .all({ $runBatchId: runBatchId }) as any[];
  return rows.map(rowToSynthesisRow);
}

export function getSynthesesForBatches(db: Database, runBatchIds: string[]): SynthesisRow[] {
  if (runBatchIds.length === 0) return [];
  const placeholders = runBatchIds.map((_, i) => `$b${i}`).join(", ");
  const params: Record<string, string> = {};
  runBatchIds.forEach((id, i) => {
    params[`$b${i}`] = id;
  });
  const rows = db
    .query(
      `SELECT * FROM syntheses WHERE run_batch_id IN (${placeholders}) ORDER BY prompt_id, repeat_index, id`,
    )
    .all(params) as any[];
  return rows.map(rowToSynthesisRow);
}

export function getAllSyntheses(db: Database): SynthesisRow[] {
  const rows = db
    .query(`SELECT * FROM syntheses ORDER BY prompt_id, repeat_index, id`)
    .all() as any[];
  return rows.map(rowToSynthesisRow);
}

function rowToSynthesisRow(row: any): SynthesisRow {
  return {
    id: row.id,
    runBatchId: row.run_batch_id,
    promptId: row.prompt_id,
    repeatIndex: row.repeat_index ?? 0,
    chairmanModelId: row.chairman_model_id,
    synthesisText: row.synthesis_text ?? undefined,
    provenance: row.provenance ?? undefined,
    rawOutput: row.raw_output ?? undefined,
    latencyMs: row.latency_ms ?? undefined,
    inputTokens: row.input_tokens ?? undefined,
    outputTokens: row.output_tokens ?? undefined,
    costUsd: row.cost_usd ?? undefined,
    status: row.status,
    error: row.error ?? undefined,
    synthesizedAt: row.synthesized_at,
  };
}
