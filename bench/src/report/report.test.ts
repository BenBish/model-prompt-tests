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

test("excludes self-judging from the headline average but reports it separately", () => {
  const db = createDb();
  const startedAt = "2026-07-08T12:00:00.000Z";
  const runId = insertRun(db, {
    runBatchId: "batch-123",
    promptId: "test/prompt",
    providerId: "test",
    modelId: "same-model",
    modelName: "model",
    startedAt,
    outputText: "output",
    status: "ok",
  });
  insertScore(db, {
    runId,
    judgeModelId: "same-model",
    score: 5,
    rationale: "self-praise",
    scoredAt: startedAt,
    status: "ok",
  });
  insertScore(db, {
    runId,
    judgeModelId: "other-judge",
    score: 2,
    rationale: "peer view",
    scoredAt: startedAt,
    status: "ok",
  });

  const data = queryReportData(db, { allRuns: true });
  const summary = data.summaries[0]!;
  expect(summary.avgScore).toBe(2);
  expect(summary.peerScoreAvg).toBe(2);
  expect(summary.selfScoreAvg).toBe(5);
  db.close();
});

test("computes cost, truncation and per-prompt aggregation", () => {
  const db = createDb();
  const startedAt = "2026-07-08T12:00:00.000Z";
  insertRun(db, {
    runBatchId: "batch-123",
    promptId: "test/prompt-a",
    providerId: "test",
    modelId: "test:model",
    modelName: "model",
    startedAt,
    inputTokens: 1000,
    outputTokens: 500,
    outputText: "output",
    status: "ok",
    costUsd: 0.02,
    stopReason: "length",
  });
  const okRunId = insertRun(db, {
    runBatchId: "batch-123",
    promptId: "test/prompt-b",
    providerId: "test",
    modelId: "test:model",
    modelName: "model",
    startedAt,
    inputTokens: 500,
    outputTokens: 200,
    outputText: "output",
    status: "ok",
    costUsd: 0.01,
    stopReason: "stop",
  });
  insertScore(db, {
    runId: okRunId,
    judgeModelId: "judge",
    score: 4,
    rationale: "good",
    scoredAt: startedAt,
    status: "ok",
  });

  const data = queryReportData(db, { allRuns: true });
  const summary = data.summaries[0]!;
  expect(summary.totalCostUsd).toBeCloseTo(0.03);
  expect(summary.avgCostUsd).toBeCloseTo(0.015);
  expect(summary.truncatedRuns).toBe(1);
  expect(summary.avgInputTokens).toBe(750);
  expect(data.promptSummaries).toHaveLength(2);
  expect(data.promptSummaries.find((p) => p.promptId === "test/prompt-b")?.avgScore).toBe(4);
  db.close();
});
