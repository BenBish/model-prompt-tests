import type { Database } from "bun:sqlite";
import { getPeerRanksForBatch, getPeerRanksForBatches, type PeerRankRow } from "../db/peerRanksRepo";
import { aggregateRankings, type RankAggregate } from "./aggregate";

export interface PeerRankGroupView {
  promptId: string;
  repeatIndex: number;
  runBatchId: string;
  /** Successful ranker results, deanonymized best-first. */
  rankings: { rankerModelId: string; modelOrder: string[]; rationale?: string }[];
  aggregate: RankAggregate[];
  errors: { rankerModelId: string; error: string }[];
}

export interface PeerRankReportData {
  groups: PeerRankGroupView[];
  /** Overall Borda across all groups (for secondary summary). */
  overall: RankAggregate[];
  totalOk: number;
  totalError: number;
  totalCostUsd?: number;
}

function parseModelIds(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function buildPeerRankReportFromRows(rows: PeerRankRow[]): PeerRankReportData {
  const groupMap = new Map<string, PeerRankRow[]>();
  for (const row of rows) {
    const key = `${row.runBatchId}\0${row.promptId}\0${row.repeatIndex}`;
    const list = groupMap.get(key) ?? [];
    list.push(row);
    groupMap.set(key, list);
  }

  const groups: PeerRankGroupView[] = [];
  let totalOk = 0;
  let totalError = 0;
  let totalCost = 0;
  let hasCost = false;
  const allOkRankings: string[][] = [];

  for (const [, groupRows] of groupMap) {
    const first = groupRows[0]!;
    const rankings: PeerRankGroupView["rankings"] = [];
    const errors: PeerRankGroupView["errors"] = [];

    for (const row of groupRows) {
      if (row.costUsd !== undefined) {
        totalCost += row.costUsd;
        hasCost = true;
      }
      if (row.status === "ok") {
        totalOk++;
        const modelOrder = parseModelIds(row.rankingModelIds);
        if (modelOrder) {
          rankings.push({
            rankerModelId: row.rankerModelId,
            modelOrder,
            rationale: row.rationale,
          });
          allOkRankings.push(modelOrder);
        }
      } else {
        totalError++;
        errors.push({
          rankerModelId: row.rankerModelId,
          error: row.error ?? "unknown error",
        });
      }
    }

    groups.push({
      promptId: first.promptId,
      repeatIndex: first.repeatIndex,
      runBatchId: first.runBatchId,
      rankings,
      aggregate: aggregateRankings(rankings.map((r) => r.modelOrder)),
      errors,
    });
  }

  groups.sort((a, b) => {
    const p = a.promptId.localeCompare(b.promptId);
    if (p !== 0) return p;
    return a.repeatIndex - b.repeatIndex;
  });

  return {
    groups,
    overall: aggregateRankings(allOkRankings),
    totalOk,
    totalError,
    totalCostUsd: hasCost ? totalCost : undefined,
  };
}

export function queryPeerRankReportData(
  db: Database,
  options: { runBatchId?: string; allRuns?: boolean } = {},
): PeerRankReportData {
  let rows: PeerRankRow[];
  if (options.runBatchId) {
    rows = getPeerRanksForBatch(db, options.runBatchId);
  } else if (options.allRuns) {
    rows = db
      .query(`SELECT * FROM peer_ranks ORDER BY prompt_id, repeat_index, id`)
      .all()
      .map((row: any) => ({
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
      }));
  } else {
    // Latest batch that has peer ranks, else empty
    const latest = db
      .query(`SELECT run_batch_id FROM peer_ranks ORDER BY ranked_at DESC LIMIT 1`)
      .get() as { run_batch_id: string } | undefined;
    rows = latest ? getPeerRanksForBatch(db, latest.run_batch_id) : [];
  }

  // When reporting a specific batch without peer ranks, stay empty.
  // When reporting default prompt report batch, also try matching that batch id
  // (caller may pass the same batch used for queryReportData).
  if (options.runBatchId && rows.length === 0) {
    return buildPeerRankReportFromRows([]);
  }

  return buildPeerRankReportFromRows(rows);
}

/** Prefer ranks for the same batch set as the main report. */
export function queryPeerRankReportForReportBatches(
  db: Database,
  runBatchIds: string[],
): PeerRankReportData {
  const unique = [...new Set(runBatchIds)];
  const rows = getPeerRanksForBatches(db, unique);
  return buildPeerRankReportFromRows(rows);
}
