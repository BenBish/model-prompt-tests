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
  const existing = target.query(`PRAGMA table_info(${migration.table})`).all() as { name: string }[];
  if (existing.some((col) => col.name === migration.column)) return;
  target.exec(`ALTER TABLE ${migration.table} ADD COLUMN ${migration.column} ${migration.ddlType}`);
}

export function applyMigrations(target: Database): void {
  for (const migration of COLUMN_MIGRATIONS) {
    ensureColumn(target, migration);
  }
  target.exec("CREATE INDEX IF NOT EXISTS idx_runs_batch ON runs(run_batch_id)");
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
