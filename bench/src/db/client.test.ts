import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { ensureColumn, migrate } from "./client";

const OLD_SCHEMA = `
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
`;

function columnNames(db: Database, table: string): string[] {
  return (db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

describe("migrate", () => {
  test("adds stop_reason, cost_usd, and attempt to a pre-migration runs table", () => {
    const db = new Database(":memory:");
    db.exec(OLD_SCHEMA);
    expect(columnNames(db, "runs")).not.toContain("cost_usd");

    migrate(db);

    const columns = columnNames(db, "runs");
    expect(columns).toContain("stop_reason");
    expect(columns).toContain("cost_usd");
    expect(columns).toContain("attempt");
    db.close();
  });

  test("is idempotent -- running twice does not error or duplicate columns", () => {
    const db = new Database(":memory:");
    db.exec(OLD_SCHEMA);

    migrate(db);
    migrate(db);

    const columns = columnNames(db, "runs");
    expect(columns.filter((c) => c === "cost_usd")).toHaveLength(1);
    db.close();
  });

  test("attempt defaults to 1 for pre-existing rows", () => {
    const db = new Database(":memory:");
    db.exec(OLD_SCHEMA);
    db.exec(
      `INSERT INTO runs (run_batch_id, prompt_id, provider_id, model_id, model_name, started_at, status) VALUES ('b','p','pr','m','mn','t','ok')`,
    );

    migrate(db);

    const row = db.query("SELECT attempt FROM runs").get() as { attempt: number };
    expect(row.attempt).toBe(1);
    db.close();
  });
});

describe("ensureColumn", () => {
  test("rejects an unsafe table identifier", () => {
    const db = new Database(":memory:");
    db.exec(OLD_SCHEMA);
    expect(() => ensureColumn(db, "runs; DROP TABLE runs;--", "x", "x TEXT")).toThrow("unsafe identifier");
    db.close();
  });

  test("rejects an unsafe column identifier", () => {
    const db = new Database(":memory:");
    db.exec(OLD_SCHEMA);
    expect(() => ensureColumn(db, "runs", "x TEXT); DROP TABLE runs;--", "x TEXT")).toThrow("unsafe identifier");
    db.close();
  });
});
