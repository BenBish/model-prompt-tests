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
  expect(row?.judgeResults).toHaveLength(1);
  expect(data.summaries[0]?.okRuns).toBe(1);

  const html = renderReportHtml(data, startedAt);
  expect(html).toContain("judge request failed: unauthorized");
  expect(html).toContain(runBatchId);
  expect(html).toContain(startedAt);
  db.close();
});

test("summarizes multiple judge scores without duplicating run rows", () => {
  const db = createDb();
  const startedAt = "2026-07-08T12:00:00.000Z";
  const runId = insertRun(db, {
    runBatchId: "batch-123",
    promptId: "test/prompt",
    providerId: "test",
    modelId: "test:model",
    modelName: "model",
    startedAt,
    latencyMs: 2000,
    outputTokens: 100,
    outputText: "output",
    status: "ok",
  });
  insertScore(db, {
    runId,
    judgeModelId: "judge-a",
    score: 4,
    rationale: "good",
    scoredAt: startedAt,
    status: "ok",
  });
  insertScore(db, {
    runId,
    judgeModelId: "judge-b",
    score: 2,
    rationale: "weak",
    scoredAt: startedAt,
    status: "ok",
  });

  const data = queryReportData(db, { allRuns: true });
  const rows = data.rows.get("test/prompt")?.get("test:model");
  expect(rows).toHaveLength(1);
  expect(rows?.[0]?.judgeResults).toHaveLength(2);
  expect(data.summaries[0]?.avgScore).toBe(3);
  expect(data.summaries[0]?.missingJudgeScores).toBe(0);
  expect(data.summaries[0]?.avgJudgeSpread).toBe(2);
  expect(data.summaries[0]?.qualityPerSecond).toBe(1.5);
  db.close();
});

test("averages model scores per run before averaging across runs", () => {
  const db = createDb();
  const startedAt = "2026-07-08T12:00:00.000Z";
  const firstRunId = insertRun(db, {
    runBatchId: "batch-123",
    promptId: "test/prompt-a",
    providerId: "test",
    modelId: "test:model",
    modelName: "model",
    startedAt,
    latencyMs: 1000,
    outputText: "output",
    status: "ok",
  });
  const secondRunId = insertRun(db, {
    runBatchId: "batch-123",
    promptId: "test/prompt-b",
    providerId: "test",
    modelId: "test:model",
    modelName: "model",
    startedAt,
    latencyMs: 1000,
    outputText: "output",
    status: "ok",
  });
  insertScore(db, {
    runId: firstRunId,
    judgeModelId: "judge-a",
    score: 5,
    rationale: "excellent",
    scoredAt: startedAt,
    status: "ok",
  });
  insertScore(db, {
    runId: firstRunId,
    judgeModelId: "judge-b",
    error: "judge did not return JSON",
    scoredAt: startedAt,
    status: "error",
  });
  insertScore(db, {
    runId: secondRunId,
    judgeModelId: "judge-a",
    score: 1,
    rationale: "poor",
    scoredAt: startedAt,
    status: "ok",
  });
  insertScore(db, {
    runId: secondRunId,
    judgeModelId: "judge-b",
    score: 1,
    rationale: "poor",
    scoredAt: startedAt,
    status: "ok",
  });

  const data = queryReportData(db, { allRuns: true });

  expect(data.summaries[0]?.avgScore).toBe(3);
  expect(data.summaries[0]?.missingJudgeScores).toBe(1);
  db.close();
});
