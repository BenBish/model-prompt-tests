import { Database } from "bun:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

let db: Database | undefined;

interface ColumnMigration {
  table: string;
  column: string;
  ddlType: string;
}

const COLUMN_MIGRATIONS: ColumnMigration[] = [
  { table: "runs", column: "repeat_index", ddlType: "INTEGER NOT NULL DEFAULT 0" },
  { table: "scores", column: "dimension_scores", ddlType: "TEXT" },
  { table: "scores", column: "weighted_score", ddlType: "REAL" },
];

function ensureColumn(target: Database, migration: ColumnMigration): void {
  const existing = target.query(`PRAGMA table_info(${migration.table})`).all() as { name: string }[];
  if (existing.some((col) => col.name === migration.column)) return;
  target.exec(`ALTER TABLE ${migration.table} ADD COLUMN ${migration.column} ${migration.ddlType}`);
}

export function applyMigrations(target: Database): void {
  for (const migration of COLUMN_MIGRATIONS) {
    ensureColumn(target, migration);
  }
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
