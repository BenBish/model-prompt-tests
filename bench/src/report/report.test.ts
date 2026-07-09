import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { insertRun } from "../db/runsRepo";
import { insertScore } from "../db/scoresRepo";
import { queryReportData } from "./queryData";
import { renderReportHtml } from "./renderHtml";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  return db;
}

test("includes judge failures and run identity in reports", () => {
  const db = createDb();
  const runBatchId = "batch-123";
  const startedAt = "2026-07-08T12:00:00.000Z";
  const runId = insertRun(db, {
    runBatchId,
    promptId: "test/prompt",
    providerId: "test",
    modelId: "test:model",
    modelName: "model",
    startedAt,
    outputText: "output",
    status: "ok",
  });
  insertScore(db, {
    runId,
    judgeModelId: "judge",
    scoredAt: startedAt,
    error: "judge request failed: unauthorized",
    status: "error",
  });

  const data = queryReportData(db, { allRuns: true });
  const row = data.rows.get("test/prompt")?.get("test:model")?.[0];
  expect(row?.judgeError).toBe("judge request failed: unauthorized");
  expect(row?.judgeStatus).toBe("error");

  const html = renderReportHtml(data, startedAt);
  expect(html).toContain("judge request failed: unauthorized");
  expect(html).toContain(runBatchId);
  expect(html).toContain(startedAt);
  db.close();
});
