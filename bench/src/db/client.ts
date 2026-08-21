import { Database } from "bun:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

let db: Database | undefined;

/** Identifiers only — never user input. Defense-in-depth for raw DDL interpolation. */
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

interface ColumnMigration {
  table: string;
  column: string;
  ddlType: string;
}

const COLUMN_MIGRATIONS: ColumnMigration[] = [
  { table: "runs", column: "repeat_index", ddlType: "INTEGER NOT NULL DEFAULT 0" },
  { table: "scores", column: "dimension_scores", ddlType: "TEXT" },
  { table: "scores", column: "weighted_score", ddlType: "REAL" },
  { table: "runs", column: "kind", ddlType: "TEXT NOT NULL DEFAULT 'prompt' CHECK (kind IN ('prompt', 'swe'))" },
  { table: "runs", column: "harness_id", ddlType: "TEXT" },
  { table: "runs", column: "stop_reason", ddlType: "TEXT" },
  { table: "runs", column: "cost_usd", ddlType: "REAL" },
  { table: "swe_results", column: "server_prompt_tokens", ddlType: "INTEGER" },
  { table: "swe_results", column: "server_prompt_seconds", ddlType: "REAL" },
  { table: "swe_results", column: "server_predicted_tokens", ddlType: "INTEGER" },
  { table: "swe_results", column: "server_predicted_seconds", ddlType: "REAL" },
  { table: "swe_results", column: "verify_tests_passed", ddlType: "INTEGER" },
  { table: "swe_results", column: "verify_tests_total", ddlType: "INTEGER" },
];

/**
 * Internal migration helper only — table/column must be compile-time constants.
 * SQLite cannot parameterize identifiers in DDL; the regex is a guard against a
 * future caller accidentally passing untrusted input.
 */
export function ensureColumn(target: Database, migration: ColumnMigration): void {
  if (!SAFE_IDENTIFIER.test(migration.table) || !SAFE_IDENTIFIER.test(migration.column)) {
    throw new Error(
      `ensureColumn: unsafe identifier (table="${migration.table}", column="${migration.column}")`,
    );
  }
  const tableExists = target
    .query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = $table`)
    .get({ $table: migration.table });
  // A migration for a table introduced after the caller's schema snapshot (e.g. swe_results
  // predates this column but not this database) is a no-op here; CREATE TABLE IF NOT EXISTS in
  // schema.sql is what actually creates it for real databases before applyMigrations runs.
  if (!tableExists) return;
  const existing = target.query(`PRAGMA table_info(${migration.table})`).all() as { name: string }[];
  if (existing.some((col) => col.name === migration.column)) return;
  target.exec(`ALTER TABLE ${migration.table} ADD COLUMN ${migration.column} ${migration.ddlType}`);
}

const PEER_RANKS_DDL = `
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
  ranked_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_peer_ranks_batch ON peer_ranks(run_batch_id);
CREATE INDEX IF NOT EXISTS idx_peer_ranks_prompt ON peer_ranks(prompt_id);
`;

const SYNTHESES_DDL = `
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
  synthesized_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_syntheses_batch ON syntheses(run_batch_id);
CREATE INDEX IF NOT EXISTS idx_syntheses_prompt ON syntheses(prompt_id);
`;

const TOOL_PROBE_RESULTS_DDL = `
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
  notes          TEXT
);
CREATE INDEX IF NOT EXISTS idx_tool_probe_results_run ON tool_probe_results(run_id);
`;

export function applyMigrations(target: Database): void {
  for (const migration of COLUMN_MIGRATIONS) {
    ensureColumn(target, migration);
  }
  target.exec("CREATE INDEX IF NOT EXISTS idx_runs_batch ON runs(run_batch_id)");
  // New table for BSH-153 peer ranking; CREATE IF NOT EXISTS is safe on existing DBs.
  target.exec(PEER_RANKS_DDL);
  // New table for BSH-150 chairman synthesis.
  target.exec(SYNTHESES_DDL);
  // New table for the Hermes tool-calling probe.
  target.exec(TOOL_PROBE_RESULTS_DDL);
}

export function openDb(dbPath: string): Database {
  if (db) return db;

  mkdirSync(dirname(dbPath), { recursive: true });
  db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  const schemaSql = readFileSync(new URL("./schema.sql", import.meta.url), "utf-8");
  db.exec(schemaSql);
  applyMigrations(db);

  return db;
}
