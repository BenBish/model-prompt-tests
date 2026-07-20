import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { applyMigrations } from "./client";

const OLD_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  run_batch_id  TEXT NOT NULL,
  prompt_id     TEXT NOT NULL,
  provider_id   TEXT NOT NULL,
  model_id      TEXT NOT NULL,
  model_name    TEXT NOT NULL,
  started_at    TEXT NOT NULL,
  latency_ms    INTEGER,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  output_text   TEXT,
  raw_response  TEXT,
  error         TEXT,
  status        TEXT NOT NULL CHECK (status IN ('ok', 'error'))
);

CREATE TABLE IF NOT EXISTS scores (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id           INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  judge_model_id   TEXT NOT NULL,
  score            INTEGER CHECK (score BETWEEN 1 AND 5),
  rationale        TEXT,
  raw_judge_output TEXT,
  scored_at        TEXT NOT NULL,
  error            TEXT,
  status           TEXT NOT NULL CHECK (status IN ('ok', 'error'))
);
`;

function tableColumns(db: Database, table: string): string[] {
  return (db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

describe("applyMigrations", () => {
  test("adds new columns to a pre-existing old-schema database without touching old rows", () => {
    const db = new Database(":memory:");
    db.exec(OLD_SCHEMA_SQL);

    db.prepare(
      `INSERT INTO runs (run_batch_id, prompt_id, provider_id, model_id, model_name, started_at, status)
       VALUES ('batch-1', 'prompt-1', 'provider-1', 'model-1', 'Model One', '2026-01-01T00:00:00Z', 'ok')`,
    ).run();
    const runId = db.query("SELECT id FROM runs").get() as { id: number };
    db.prepare(
      `INSERT INTO scores (run_id, judge_model_id, score, rationale, scored_at, status)
       VALUES ($runId, 'judge-1', 4, 'solid answer', '2026-01-01T00:00:01Z', 'ok')`,
    ).run({ $runId: runId.id });

    expect(tableColumns(db, "runs")).not.toContain("repeat_index");
    expect(tableColumns(db, "scores")).not.toContain("dimension_scores");

    applyMigrations(db);

    expect(tableColumns(db, "runs")).toContain("repeat_index");
    expect(tableColumns(db, "scores")).toContain("dimension_scores");
    expect(tableColumns(db, "scores")).toContain("weighted_score");

    const run = db.query("SELECT * FROM runs WHERE id = $id").get({ $id: runId.id }) as any;
    expect(run.prompt_id).toBe("prompt-1");
    expect(run.repeat_index).toBe(0);

    const score = db.query("SELECT * FROM scores WHERE run_id = $id").get({ $id: runId.id }) as any;
    expect(score.score).toBe(4);
    expect(score.dimension_scores).toBeNull();
    expect(score.weighted_score).toBeNull();
  });

  test("is idempotent when columns already exist", () => {
    const db = new Database(":memory:");
    db.exec(OLD_SCHEMA_SQL);
    applyMigrations(db);
    expect(() => applyMigrations(db)).not.toThrow();
  });
});
