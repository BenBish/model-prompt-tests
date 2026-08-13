import type { Database } from "bun:sqlite";
import {
  getAllSyntheses,
  getSynthesesForBatch,
  getSynthesesForBatches,
  type SynthesisRow,
} from "../db/synthesesRepo";

export interface SynthesisProvenance {
  candidateModelIds: string[];
  peerRankOrder?: string[] | null;
  usedModelIds: string[];
  notes?: string;
}

export interface SynthesisGroupView {
  promptId: string;
  repeatIndex: number;
  runBatchId: string;
  chairmanModelId: string;
  status: "ok" | "error";
  synthesisText?: string;
  provenance?: SynthesisProvenance;
  error?: string;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
}

export interface SynthesisReportData {
  groups: SynthesisGroupView[];
  totalOk: number;
  totalError: number;
  totalCostUsd?: number;
}

function parseProvenance(raw: string | undefined): SynthesisProvenance | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return undefined;
    const candidateModelIds = Array.isArray(parsed.candidateModelIds)
      ? parsed.candidateModelIds.filter((id: unknown) => typeof id === "string")
      : [];
    const usedModelIds = Array.isArray(parsed.usedModelIds)
      ? parsed.usedModelIds.filter((id: unknown) => typeof id === "string")
      : [];
    const peerRankOrder = Array.isArray(parsed.peerRankOrder)
      ? parsed.peerRankOrder.filter((id: unknown) => typeof id === "string")
      : parsed.peerRankOrder === null
        ? null
        : undefined;
    return {
      candidateModelIds,
      usedModelIds,
      peerRankOrder,
      notes: typeof parsed.notes === "string" ? parsed.notes : undefined,
    };
  } catch {
    return undefined;
  }
}

function latestRowsPerGroup(rows: SynthesisRow[]): SynthesisRow[] {
  const latest = new Map<string, SynthesisRow>();
  for (const row of rows) {
    const key = `${row.runBatchId}\0${row.promptId}\0${row.repeatIndex}`;
    const existing = latest.get(key);
    if (!existing || row.id > existing.id) latest.set(key, row);
  }
  return [...latest.values()];
}

export function buildSynthesisReportFromRows(
  rows: SynthesisRow[],
  options: { allRuns?: boolean } = {},
): SynthesisReportData {
  const selected = options.allRuns ? rows : latestRowsPerGroup(rows);
  let totalOk = 0;
  let totalError = 0;
  let totalCost = 0;
  let hasCost = false;

  const groups: SynthesisGroupView[] = selected.map((row) => {
    if (row.costUsd !== undefined) {
      totalCost += row.costUsd;
      hasCost = true;
    }
    if (row.status === "ok") totalOk++;
    else totalError++;
    return {
      promptId: row.promptId,
      repeatIndex: row.repeatIndex,
      runBatchId: row.runBatchId,
      chairmanModelId: row.chairmanModelId,
      status: row.status,
      synthesisText: row.synthesisText,
      provenance: parseProvenance(row.provenance),
      error: row.error,
      costUsd: row.costUsd,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      latencyMs: row.latencyMs,
    };
  });

  groups.sort((a, b) => {
    const p = a.promptId.localeCompare(b.promptId);
    if (p !== 0) return p;
    return a.repeatIndex - b.repeatIndex;
  });

  return {
    groups,
    totalOk,
    totalError,
    totalCostUsd: hasCost ? totalCost : undefined,
  };
}

export function querySynthesisReportData(
  db: Database,
  options: { runBatchId?: string; allRuns?: boolean } = {},
): SynthesisReportData {
  let rows: SynthesisRow[];
  if (options.runBatchId) {
    rows = getSynthesesForBatch(db, options.runBatchId);
  } else if (options.allRuns) {
    rows = getAllSyntheses(db);
  } else {
    const latest = db
      .query(`SELECT run_batch_id FROM syntheses ORDER BY synthesized_at DESC LIMIT 1`)
      .get() as { run_batch_id: string } | undefined;
    rows = latest ? getSynthesesForBatch(db, latest.run_batch_id) : [];
  }
  return buildSynthesisReportFromRows(rows, { allRuns: options.allRuns });
}

export function querySynthesisReportForReportBatches(
  db: Database,
  runBatchIds: string[],
): SynthesisReportData {
  return buildSynthesisReportFromRows(getSynthesesForBatches(db, [...new Set(runBatchIds)]));
}
