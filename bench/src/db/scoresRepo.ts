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
  dimensionScores?: Record<string, { score: number; rationale: string }>;
  weightedScore?: number;
}

export function insertScore(db: Database, record: ScoreRecord): number {
  const stmt = db.prepare(`
    INSERT INTO scores (
      run_id, judge_model_id, score, rationale, raw_judge_output, scored_at, error, status,
      dimension_scores, weighted_score
    ) VALUES (
      $runId, $judgeModelId, $score, $rationale, $rawJudgeOutput, $scoredAt, $error, $status,
      $dimensionScores, $weightedScore
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
    $dimensionScores: record.dimensionScores ? JSON.stringify(record.dimensionScores) : null,
    $weightedScore: record.weightedScore ?? null,
  });

  return Number(result.lastInsertRowid);
}
