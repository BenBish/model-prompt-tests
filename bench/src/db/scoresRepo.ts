import type { Database } from "bun:sqlite";

export interface ScoreRecord {
  runId: number;
  judgeModelId: string;
  score?: number;
  rationale?: string;
  rawJudgeOutput?: string;
  scoredAt: string;
  error?: string;
  status: "ok" | "error";
}

export function insertScore(db: Database, record: ScoreRecord): number {
  const stmt = db.prepare(`
    INSERT INTO scores (
      run_id, judge_model_id, score, rationale, raw_judge_output, scored_at, error, status
    ) VALUES (
      $runId, $judgeModelId, $score, $rationale, $rawJudgeOutput, $scoredAt, $error, $status
    )
  `);

  const result = stmt.run({
    $runId: record.runId,
    $judgeModelId: record.judgeModelId,
    $score: record.score ?? null,
    $rationale: record.rationale ?? null,
    $rawJudgeOutput: record.rawJudgeOutput ?? null,
    $scoredAt: record.scoredAt,
    $error: record.error ?? null,
    $status: record.status,
  });

  return Number(result.lastInsertRowid);
}
