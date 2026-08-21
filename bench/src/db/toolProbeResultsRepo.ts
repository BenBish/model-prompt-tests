import type { Database } from "bun:sqlite";

export interface ToolProbeResultRecord {
  runId: number;
  caseId: string;
  expectedTool?: string;
  wellFormed: boolean;
  correctTool: boolean;
  validArgs: boolean;
  calledTool?: string;
  argumentsRaw?: string;
  notes?: string;
}

export interface ToolProbeResultRow extends ToolProbeResultRecord {
  id: number;
}

export function insertToolProbeResult(db: Database, record: ToolProbeResultRecord): number {
  const stmt = db.prepare(`
    INSERT INTO tool_probe_results (
      run_id, case_id, expected_tool, well_formed, correct_tool, valid_args,
      called_tool, arguments_raw, notes
    ) VALUES (
      $runId, $caseId, $expectedTool, $wellFormed, $correctTool, $validArgs,
      $calledTool, $argumentsRaw, $notes
    )
  `);

  const result = stmt.run({
    $runId: record.runId,
    $caseId: record.caseId,
    $expectedTool: record.expectedTool ?? null,
    $wellFormed: record.wellFormed ? 1 : 0,
    $correctTool: record.correctTool ? 1 : 0,
    $validArgs: record.validArgs ? 1 : 0,
    $calledTool: record.calledTool ?? null,
    $argumentsRaw: record.argumentsRaw ?? null,
    $notes: record.notes ?? null,
  });

  return Number(result.lastInsertRowid);
}

export function getToolProbeResultForRun(db: Database, runId: number): ToolProbeResultRow | undefined {
  const row = db.query("SELECT * FROM tool_probe_results WHERE run_id = $runId").get({ $runId: runId }) as any;
  if (!row) return undefined;
  return rowToToolProbeResultRow(row);
}

export function getToolProbeResultsForBatch(db: Database, runBatchId: string): ToolProbeResultRow[] {
  const rows = db
    .query(
      `SELECT tool_probe_results.* FROM tool_probe_results
       JOIN runs ON runs.id = tool_probe_results.run_id
       WHERE runs.run_batch_id = $runBatchId`,
    )
    .all({ $runBatchId: runBatchId }) as any[];
  return rows.map(rowToToolProbeResultRow);
}

function rowToToolProbeResultRow(row: any): ToolProbeResultRow {
  return {
    id: row.id,
    runId: row.run_id,
    caseId: row.case_id,
    expectedTool: row.expected_tool ?? undefined,
    wellFormed: Boolean(row.well_formed),
    correctTool: Boolean(row.correct_tool),
    validArgs: Boolean(row.valid_args),
    calledTool: row.called_tool ?? undefined,
    argumentsRaw: row.arguments_raw ?? undefined,
    notes: row.notes ?? undefined,
  };
}
