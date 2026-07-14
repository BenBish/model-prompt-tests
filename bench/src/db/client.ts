import { Database } from "bun:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

let db: Database | undefined;

function ensureColumn(db: Database, table: string, column: string, ddl: string): void {
  const info = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!info.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

// Additive-only migrations for databases created before schema.sql gained these
// columns. schema.sql is authoritative for fresh databases; this upgrades
// existing ones in place. Safe to run on every open (idempotent, cheap).
function migrate(db: Database): void {
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
