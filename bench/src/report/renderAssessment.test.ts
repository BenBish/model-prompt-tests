import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { insertRun } from "../db/runsRepo";
import { insertScore } from "../db/scoresRepo";
import { queryReportData } from "./queryData";
import { buildAssessmentSummary, buildNarrativePrompt, renderAssessmentMarkdown } from "./renderAssessment";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  return db;
}

const meta = {
  generatedAt: "2026-07-18T00:00:00.000Z",
  reportPath: "bench/reports/test.html",
  summaryPath: "bench/reports/test.summary.json",
  runBatchId: "batch-1",
};

describe("renderAssessmentMarkdown", () => {
  test("includes the model summary table and reports no errors when there are none", () => {
    const db = createDb();
    const runId = insertRun(db, {
      runBatchId: "batch-1",
      promptId: "test/prompt",
      providerId: "test",
      modelId: "test:model",
      modelName: "model",
      startedAt: "2026-01-01T00:00:00.000Z",
      outputText: "output",
      status: "ok",
    });
    insertScore(db, {
      runId,
      judgeModelId: "judge",
      score: 4,
      rationale: "good",
      scoredAt: "2026-01-01T00:00:01.000Z",
      status: "ok",
    });

    const data = queryReportData(db, { allRuns: true });
    const markdown = renderAssessmentMarkdown(data, meta);

    expect(markdown).toContain("# Bench Assessment");
    expect(markdown).toContain("`test:model`");
    expect(markdown).toContain("## Errors\n\nNone.");
    expect(markdown).not.toContain("## Flagged for Review");
    db.close();
  });

  test("flags high judge disagreement and lists run/judge errors", () => {
    const db = createDb();
    const runId = insertRun(db, {
      runBatchId: "batch-1",
      promptId: "test/prompt",
      providerId: "test",
      modelId: "test:model",
      modelName: "model",
      startedAt: "2026-01-01T00:00:00.000Z",
      outputText: "output",
      status: "ok",
    });
    insertScore(db, { runId, judgeModelId: "judge-a", score: 1, rationale: "poor", scoredAt: "t", status: "ok" });
    insertScore(db, { runId, judgeModelId: "judge-b", score: 5, rationale: "great", scoredAt: "t", status: "ok" });
    insertScore(db, {
      runId,
      judgeModelId: "judge-c",
      error: "did not return JSON",
      scoredAt: "t",
      status: "error",
    });

    insertRun(db, {
      runBatchId: "batch-1",
      promptId: "test/prompt-b",
      providerId: "test",
      modelId: "test:model",
      modelName: "model",
      startedAt: "2026-01-01T00:00:00.000Z",
      status: "error",
      error: "request timed out",
    });

    const data = queryReportData(db, { allRuns: true });
    const markdown = renderAssessmentMarkdown(data, meta);

    expect(markdown).toContain("## Flagged for Review");
    expect(markdown).toContain("spread 4");
    expect(markdown).toContain("## Errors");
    expect(markdown).toContain("run error — request timed out");
    expect(markdown).toContain("judge error (judge-c) — did not return JSON");
    db.close();
  });

  test("lists per-prompt winners only when more than one model competed", () => {
    const db = createDb();
    const runA = insertRun(db, {
      runBatchId: "batch-1",
      promptId: "test/prompt",
      providerId: "test",
      modelId: "model-a",
      modelName: "model-a",
      startedAt: "2026-01-01T00:00:00.000Z",
      outputText: "output",
      status: "ok",
    });
    insertScore(db, { runId: runA, judgeModelId: "judge", score: 5, rationale: "best", scoredAt: "t", status: "ok" });
    const runB = insertRun(db, {
      runBatchId: "batch-1",
      promptId: "test/prompt",
      providerId: "test",
      modelId: "model-b",
      modelName: "model-b",
      startedAt: "2026-01-01T00:00:00.000Z",
      outputText: "output",
      status: "ok",
    });
    insertScore(db, { runId: runB, judgeModelId: "judge", score: 2, rationale: "weak", scoredAt: "t", status: "ok" });

    const data = queryReportData(db, { allRuns: true });
    const markdown = renderAssessmentMarkdown(data, meta);

    expect(markdown).toContain("## Per-Prompt Winners");
    expect(markdown).toContain("`test/prompt`: `model-a`");
    db.close();
  });
});

describe("buildNarrativePrompt", () => {
  test("embeds the exact summary JSON and forbids invented numbers", () => {
    const db = createDb();
    const data = queryReportData(db, { allRuns: true });
    const summary = buildAssessmentSummary(data, meta);
    const { systemPrompt, userPrompt } = buildNarrativePrompt(summary);

    expect(systemPrompt).toContain("never invent or estimate a number");
    expect(userPrompt).toContain(JSON.stringify(summary.meta.runBatchId));
    db.close();
  });
});
