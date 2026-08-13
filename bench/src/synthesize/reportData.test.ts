import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { applyMigrations } from "../db/client";
import { insertSynthesis } from "../db/synthesesRepo";
import { querySynthesisReportData } from "./reportData";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  applyMigrations(db);
  return db;
}

describe("querySynthesisReportData", () => {
  test("default view keeps the latest synthesis per prompt/repeat", () => {
    const db = createDb();
    insertSynthesis(db, {
      runBatchId: "b1",
      promptId: "p",
      repeatIndex: 0,
      chairmanModelId: "chair",
      synthesisText: "old",
      status: "ok",
      synthesizedAt: "2026-08-13T00:00:00.000Z",
    });
    insertSynthesis(db, {
      runBatchId: "b1",
      promptId: "p",
      repeatIndex: 0,
      chairmanModelId: "chair",
      synthesisText: "new",
      status: "ok",
      synthesizedAt: "2026-08-13T00:01:00.000Z",
    });

    const latest = querySynthesisReportData(db, { runBatchId: "b1" });
    expect(latest.groups).toHaveLength(1);
    expect(latest.groups[0]!.synthesisText).toBe("new");
    expect(latest.totalOk).toBe(1);

    const all = querySynthesisReportData(db, { runBatchId: "b1", allRuns: true });
    expect(all.groups).toHaveLength(2);
    expect(all.totalOk).toBe(2);
  });
});
