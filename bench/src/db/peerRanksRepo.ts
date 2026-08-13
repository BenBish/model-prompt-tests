import type { Database } from "bun:sqlite";

export interface PeerRankRecord {
  runBatchId: string;
  promptId: string;
  repeatIndex: number;
  rankerModelId: string;
  /** JSON: label → model id for this call */
  labelMapping: string;
  /** JSON best-first labels, when ok */
  rankingLabels?: string;
  /** JSON best-first model ids (deanonymized), when ok */
  rankingModelIds?: string;
  rationale?: string;
  rawOutput?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  status: "ok" | "error";
  error?: string;
  rankedAt: string;
}

export interface PeerRankRow extends PeerRankRecord {
  id: number;
}

export function insertPeerRank(db: Database, record: PeerRankRecord): number {
  const stmt = db.prepare(`
    INSERT INTO peer_ranks (
      run_batch_id, prompt_id, repeat_index, ranker_model_id,
      label_mapping, ranking_labels, ranking_model_ids, rationale, raw_output,
      latency_ms, input_tokens, output_tokens, cost_usd,
      status, error, ranked_at
    ) VALUES (
      $runBatchId, $promptId, $repeatIndex, $rankerModelId,
      $labelMapping, $rankingLabels, $rankingModelIds, $rationale, $rawOutput,
      $latencyMs, $inputTokens, $outputTokens, $costUsd,
      $status, $error, $rankedAt
    )
  `);

  const result = stmt.run({
    $runBatchId: record.runBatchId,
    $promptId: record.promptId,
    $repeatIndex: record.repeatIndex,
    $rankerModelId: record.rankerModelId,
    $labelMapping: record.labelMapping,
    $rankingLabels: record.rankingLabels ?? null,
    $rankingModelIds: record.rankingModelIds ?? null,
    $rationale: record.rationale ?? null,
    $rawOutput: record.rawOutput ?? null,
    $latencyMs: record.latencyMs ?? null,
    $inputTokens: record.inputTokens ?? null,
    $outputTokens: record.outputTokens ?? null,
    $costUsd: record.costUsd ?? null,
    $status: record.status,
    $error: record.error ?? null,
    $rankedAt: record.rankedAt,
  });

  return Number(result.lastInsertRowid);
}

export function getPeerRanksForBatch(db: Database, runBatchId: string): PeerRankRow[] {
  const rows = db
    .query(
      `SELECT * FROM peer_ranks WHERE run_batch_id = $runBatchId ORDER BY prompt_id, repeat_index, id`,
    )
    .all({ $runBatchId: runBatchId }) as any[];
  return rows.map(rowToPeerRankRow);
}

export function getPeerRanksForBatches(db: Database, runBatchIds: string[]): PeerRankRow[] {
  if (runBatchIds.length === 0) return [];
  const placeholders = runBatchIds.map((_, i) => `$b${i}`).join(", ");
  const params: Record<string, string> = {};
  runBatchIds.forEach((id, i) => {
    params[`$b${i}`] = id;
  });
  const rows = db
    .query(
      `SELECT * FROM peer_ranks WHERE run_batch_id IN (${placeholders}) ORDER BY prompt_id, repeat_index, id`,
    )
    .all(params) as any[];
  return rows.map(rowToPeerRankRow);
}

function rowToPeerRankRow(row: any): PeerRankRow {
  return {
    id: row.id,
    runBatchId: row.run_batch_id,
    promptId: row.prompt_id,
    repeatIndex: row.repeat_index ?? 0,
    rankerModelId: row.ranker_model_id,
    labelMapping: row.label_mapping,
    rankingLabels: row.ranking_labels ?? undefined,
    rankingModelIds: row.ranking_model_ids ?? undefined,
    rationale: row.rationale ?? undefined,
    rawOutput: row.raw_output ?? undefined,
    latencyMs: row.latency_ms ?? undefined,
    inputTokens: row.input_tokens ?? undefined,
    outputTokens: row.output_tokens ?? undefined,
    costUsd: row.cost_usd ?? undefined,
    status: row.status,
    error: row.error ?? undefined,
    rankedAt: row.ranked_at,
  };
}
