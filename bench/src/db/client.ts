import { Database } from "bun:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

let db: Database | undefined;

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/**
 * Internal migration helper only -- table/column/ddl must be compile-time
 * constants from `migrate()` below, never derived from user input. SQLite
 * doesn't support parameterizing identifiers in DDL, so this is raw string
 * interpolation; the identifier check is a guard against a future caller
 * accidentally passing untrusted input, not a defense against the current
 * (hardcoded) call sites.
 */
export function ensureColumn(db: Database, table: string, column: string, ddl: string): void {
  if (!SAFE_IDENTIFIER.test(table) || !SAFE_IDENTIFIER.test(column)) {
    throw new Error(`ensureColumn: unsafe identifier (table="${table}", column="${column}")`);
  }
  const info = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!info.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

// Additive-only migrations for databases created before schema.sql gained these
// columns. schema.sql is authoritative for fresh databases; this upgrades
// existing ones in place. Safe to run on every open (idempotent, cheap).
export function migrate(db: Database): void {
  ensureColumn(db, "runs", "stop_reason", "stop_reason TEXT");
  ensureColumn(db, "runs", "cost_usd", "cost_usd REAL");
  ensureColumn(db, "runs", "attempt", "attempt INTEGER NOT NULL DEFAULT 1");
  db.exec("CREATE INDEX IF NOT EXISTS idx_runs_batch ON runs(run_batch_id)");
}

export function openDb(dbPath: string): Database {
  if (db) return db;

  mkdirSync(dirname(dbPath), { recursive: true });
  db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  const schemaSql = readFileSync(new URL("./schema.sql", import.meta.url), "utf-8");
  db.exec(schemaSql);
  migrate(db);

  return db;
}
