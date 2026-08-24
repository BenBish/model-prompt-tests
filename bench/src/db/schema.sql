CREATE TABLE IF NOT EXISTS experiments (
  id             TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  manifest_json  TEXT NOT NULL,
  created_at     TEXT NOT NULL
);

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
  outcome_category TEXT CHECK (outcome_category IN ('passed','candidate_failure','timeout','rate_limit','provider_error','connection_error','harness_error')),
  repeat_index  INTEGER NOT NULL DEFAULT 0,
  kind          TEXT NOT NULL DEFAULT 'prompt' CHECK (kind IN ('prompt', 'swe')),
  harness_id    TEXT,
  stop_reason   TEXT,
  cost_usd      REAL,
  experiment_id TEXT REFERENCES experiments(id)
);

CREATE TABLE IF NOT EXISTS swe_results (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id             INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  task_type          TEXT NOT NULL,
  workdir            TEXT,
  baseline_sha       TEXT,
  diff_patch         TEXT,
  files_changed      INTEGER,
  lines_added        INTEGER,
  lines_removed      INTEGER,
  transcript         TEXT,
  agent_exit_code    INTEGER,
  agent_timed_out    INTEGER NOT NULL DEFAULT 0,
  verify_command     TEXT,
  verify_exit_code   INTEGER,
  verify_passed      INTEGER,
  verify_output      TEXT,
  verify_duration_ms INTEGER,
  review_metrics     TEXT,
  error              TEXT,
  server_prompt_tokens      INTEGER,
  server_prompt_seconds     REAL,
  server_predicted_tokens   INTEGER,
  server_predicted_seconds  REAL,
  verify_tests_passed       INTEGER,
  verify_tests_total        INTEGER
  ,verification_detail       TEXT
  ,outcome_category          TEXT CHECK (outcome_category IN ('passed','candidate_failure','timeout','invalid_output','harness_error','verifier_error','judge_error'))
  ,task_lifecycle            TEXT
  ,grader_version            TEXT
  ,health_status             TEXT
  ,environment_fingerprint   TEXT
  ,health_validated_at       TEXT
  ,publication_status        TEXT NOT NULL DEFAULT 'comparable' CHECK (publication_status IN ('comparable', 'quarantined'))
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
  weighted_score   REAL,
  experiment_id    TEXT REFERENCES experiments(id)
);

CREATE TABLE IF NOT EXISTS peer_ranks (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  run_batch_id       TEXT NOT NULL,
  prompt_id          TEXT NOT NULL,
  repeat_index       INTEGER NOT NULL DEFAULT 0,
  ranker_model_id    TEXT NOT NULL,
  label_mapping      TEXT NOT NULL,
  ranking_labels     TEXT,
  ranking_model_ids  TEXT,
  rationale          TEXT,
  raw_output         TEXT,
  latency_ms         INTEGER,
  input_tokens       INTEGER,
  output_tokens      INTEGER,
  cost_usd           REAL,
  status             TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  error              TEXT,
  ranked_at          TEXT NOT NULL,
  experiment_id      TEXT REFERENCES experiments(id)
);

CREATE INDEX IF NOT EXISTS idx_runs_prompt ON runs(prompt_id);
CREATE INDEX IF NOT EXISTS idx_runs_model ON runs(model_id);
CREATE INDEX IF NOT EXISTS idx_runs_batch ON runs(run_batch_id);
CREATE INDEX IF NOT EXISTS idx_scores_run ON scores(run_id);
CREATE INDEX IF NOT EXISTS idx_swe_results_run ON swe_results(run_id);
CREATE TABLE IF NOT EXISTS syntheses (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  run_batch_id       TEXT NOT NULL,
  prompt_id          TEXT NOT NULL,
  repeat_index       INTEGER NOT NULL DEFAULT 0,
  chairman_model_id  TEXT NOT NULL,
  synthesis_text     TEXT,
  provenance         TEXT,
  raw_output         TEXT,
  latency_ms         INTEGER,
  input_tokens       INTEGER,
  output_tokens      INTEGER,
  cost_usd           REAL,
  status             TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  error              TEXT,
  synthesized_at     TEXT NOT NULL,
  experiment_id      TEXT REFERENCES experiments(id)
);

CREATE INDEX IF NOT EXISTS idx_peer_ranks_batch ON peer_ranks(run_batch_id);
CREATE INDEX IF NOT EXISTS idx_peer_ranks_prompt ON peer_ranks(prompt_id);

CREATE TABLE IF NOT EXISTS tool_probe_results (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id         INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  case_id        TEXT NOT NULL,
  expected_tool  TEXT,
  well_formed    INTEGER NOT NULL DEFAULT 0,
  correct_tool   INTEGER NOT NULL DEFAULT 0,
  valid_args     INTEGER NOT NULL DEFAULT 0,
  called_tool    TEXT,
  arguments_raw  TEXT,
  notes          TEXT,
  experiment_id  TEXT REFERENCES experiments(id)
);
CREATE INDEX IF NOT EXISTS idx_tool_probe_results_run ON tool_probe_results(run_id);
CREATE INDEX IF NOT EXISTS idx_syntheses_batch ON syntheses(run_batch_id);
CREATE INDEX IF NOT EXISTS idx_syntheses_prompt ON syntheses(prompt_id);
