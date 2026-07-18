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
  status        TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  repeat_index  INTEGER NOT NULL DEFAULT 0
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
  status           TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  dimension_scores TEXT,
  weighted_score   REAL
);

CREATE INDEX IF NOT EXISTS idx_runs_prompt ON runs(prompt_id);
CREATE INDEX IF NOT EXISTS idx_runs_model ON runs(model_id);
CREATE INDEX IF NOT EXISTS idx_scores_run ON scores(run_id);
