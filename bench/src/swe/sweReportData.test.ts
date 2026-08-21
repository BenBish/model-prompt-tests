import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { insertRun } from "../db/runsRepo";
import { insertScore } from "../db/scoresRepo";
import { insertSweResult } from "../db/sweResultsRepo";
import { querySweReportData } from "./sweReportData";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  return db;
}

function insertSweRun(
  db: Database,
  overrides: Partial<Parameters<typeof insertRun>[1]> = {},
): number {
  return insertRun(db, {
    runBatchId: "batch-1",
    promptId: "swe-tasks/fixture/smoke",
    providerId: "claude-code",
    modelId: "claude-code:haiku",
    modelName: "claude-haiku",
    startedAt: "2026-01-01T00:00:00.000Z",
    status: "ok",
    kind: "swe",
    harnessId: "claude-code",
    ...overrides,
  });
}

describe("querySweReportData", () => {
  test("splits model_id into harnessId/modelAlias and excludes prompt-kind runs", () => {
    const db = createDb();
    insertSweRun(db);
    insertRun(db, {
      runBatchId: "batch-1",
      promptId: "debugging/javascript-debounce",
      providerId: "anthropic",
      modelId: "anthropic:sonnet",
      modelName: "sonnet",
      startedAt: "2026-01-01T00:00:00.000Z",
      status: "ok",
      kind: "prompt",
    });

    const data = querySweReportData(db, { allRuns: true });
    expect(data.taskIds).toEqual(["swe-tasks/fixture/smoke"]);
    expect(data.harnessModelIds).toEqual(["claude-code:haiku"]);
    const row = data.rows.get("swe-tasks/fixture/smoke")?.get("claude-code:haiku")?.[0];
    expect(row?.harnessId).toBe("claude-code");
    expect(row?.modelAlias).toBe("haiku");
  });

  test("joins swe_results fields onto the row", () => {
    const db = createDb();
    const runId = insertSweRun(db);
    insertSweResult(db, {
      runId,
      taskType: "fixture",
      diffPatch: "diff --git a/x b/x\n",
      filesChanged: 1,
      linesAdded: 3,
      linesRemoved: 1,
      verifyCommand: "bun test",
      verifyPassed: true,
      agentTimedOut: false,
    });

    const data = querySweReportData(db, { allRuns: true });
    const row = data.rows.get("swe-tasks/fixture/smoke")?.get("claude-code:haiku")?.[0];
    expect(row?.diffPatch).toContain("diff --git");
    expect(row?.verifyPassed).toBe(true);
    expect(row?.linesAdded).toBe(3);
  });

  test("computes verifyPassRate from verifyTestsPassed/verifyTestsTotal, undefined when no counts", () => {
    const db = createDb();
    const withCounts = insertSweRun(db);
    insertSweResult(db, {
      runId: withCounts,
      taskType: "fixture",
      verifyPassed: false,
      verifyTestsPassed: 7,
      verifyTestsTotal: 9,
    });
    const withoutCounts = insertSweRun(db, { promptId: "swe-tasks/fixture/other" });
    insertSweResult(db, { runId: withoutCounts, taskType: "fixture", verifyPassed: false });

    const data = querySweReportData(db, { allRuns: true });
    const rowWithCounts = data.rows.get("swe-tasks/fixture/smoke")?.get("claude-code:haiku")?.[0];
    expect(rowWithCounts?.verifyTestsPassed).toBe(7);
    expect(rowWithCounts?.verifyTestsTotal).toBe(9);
    expect(rowWithCounts?.verifyPassRate).toBeCloseTo(7 / 9, 5);

    const rowWithoutCounts = data.rows.get("swe-tasks/fixture/other")?.get("claude-code:haiku")?.[0];
    expect(rowWithoutCounts?.verifyPassRate).toBeUndefined();
  });

  test("keeps only the latest batch per cell by default, all repeats included", () => {
    const db = createDb();
    insertSweRun(db, { runBatchId: "batch-old", startedAt: "2026-01-01T00:00:00.000Z" });
    insertSweRun(db, { runBatchId: "batch-new", startedAt: "2026-01-02T00:00:00.000Z", repeatIndex: 0 });
    insertSweRun(db, { runBatchId: "batch-new", startedAt: "2026-01-02T00:01:00.000Z", repeatIndex: 1 });

    const data = querySweReportData(db);
    const rows = data.rows.get("swe-tasks/fixture/smoke")?.get("claude-code:haiku");
    expect(rows).toHaveLength(2);
    expect(rows?.every((r) => r.runBatchId === "batch-new")).toBe(true);
  });

  test("summarizes pass rate, judge scores, latency, diff size, and timeouts", () => {
    const db = createDb();
    const passRun = insertSweRun(db, { latencyMs: 1000 });
    insertSweResult(db, { runId: passRun, taskType: "fixture", verifyPassed: true, linesAdded: 2, linesRemoved: 0 });
    insertScore(db, { runId: passRun, judgeModelId: "judge", score: 5, rationale: "great", scoredAt: "t", status: "ok" });

    const failRun = insertSweRun(db, { latencyMs: 2000, promptId: "swe-tasks/fixture/other" });
    insertSweResult(db, {
      runId: failRun,
      taskType: "fixture",
      verifyPassed: false,
      linesAdded: 1,
      linesRemoved: 1,
      agentTimedOut: true,
    });
    insertScore(db, { runId: failRun, judgeModelId: "judge", score: 3, rationale: "meh", scoredAt: "t", status: "ok" });

    const errorRun = insertSweRun(db, {
      status: "error",
      error: "harness crashed",
      promptId: "swe-tasks/fixture/broken",
    });
    void errorRun;

    const data = querySweReportData(db, { allRuns: true });
    const summary = data.summaries.find((s) => s.harnessModelId === "claude-code:haiku")!;

    expect(summary.totalRuns).toBe(3);
    expect(summary.okRuns).toBe(2);
    expect(summary.errorRuns).toBe(1);
    expect(summary.passedRuns).toBe(1);
    expect(summary.failedRuns).toBe(1);
    expect(summary.passRate).toBe(0.5);
    expect(summary.cleanPassedRuns).toBe(1);
    expect(summary.verifiedTimedOutRuns).toBe(0);
    expect(summary.cleanPassRate).toBe(0.5);
    expect(summary.avgJudgeScore).toBe(4);
    expect(summary.avgAgentLatencyMs).toBe(1500);
    expect(summary.avgDiffLines).toBe(2);
    expect(summary.timeouts).toBe(1);
  });

  test("weights decode/prompt tok/s by total tokens over total seconds, not per-row average", () => {
    const db = createDb();
    // Row A: 600 tokens / 12s = 50 tok/s. Row B: 100 tokens / 20s = 5 tok/s.
    // Naive row-average would give 27.5; weighted gives 700/32 = 21.875.
    const runA = insertSweRun(db);
    insertSweResult(db, {
      runId: runA,
      taskType: "fixture",
      verifyPassed: true,
      serverPromptTokens: 300,
      serverPromptSeconds: 3,
      serverPredictedTokens: 600,
      serverPredictedSeconds: 12,
    });
    const runB = insertSweRun(db, { promptId: "swe-tasks/fixture/other" });
    insertSweResult(db, {
      runId: runB,
      taskType: "fixture",
      verifyPassed: true,
      serverPromptTokens: 100,
      serverPromptSeconds: 2,
      serverPredictedTokens: 100,
      serverPredictedSeconds: 20,
    });

    const data = querySweReportData(db, { allRuns: true });
    const summary = data.summaries.find((s) => s.harnessModelId === "claude-code:haiku")!;
    expect(summary.avgDecodeTokensPerSec).toBeCloseTo(700 / 32, 5);
    expect(summary.avgPromptTokensPerSec).toBeCloseTo(400 / 5, 5);
  });

  test("falls back to output_tokens / latency when no server metrics are present", () => {
    const db = createDb();
    const runId = insertSweRun(db, { latencyMs: 4000, outputTokens: 200 });
    insertSweResult(db, { runId, taskType: "fixture", verifyPassed: true });

    const data = querySweReportData(db, { allRuns: true });
    const summary = data.summaries.find((s) => s.harnessModelId === "claude-code:haiku")!;
    expect(summary.avgDecodeTokensPerSec).toBeCloseTo(200 / 4, 5);
    expect(summary.avgPromptTokensPerSec).toBeUndefined();
  });

  test("passRate is undefined when no ok runs have a verify result yet", () => {
    const db = createDb();
    insertSweRun(db, { status: "error", error: "boom" });

    const data = querySweReportData(db, { allRuns: true });
    const summary = data.summaries.find((s) => s.harnessModelId === "claude-code:haiku")!;
    expect(summary.passRate).toBeUndefined();
  });

  test("avgVerifyPassRate distinguishes two models that fail identically on binary pass/fail", () => {
    const db = createDb();
    // Both models fail every run (verifyPassed: false, same passRate), but model A consistently
    // fails only 1/9 hidden tests while model B fails 8/9 — avgVerifyPassRate should separate them
    // even though passRate cannot.
    const modelARun = insertSweRun(db, { modelId: "claude-code:modelA" });
    insertSweResult(db, {
      runId: modelARun,
      taskType: "fixture",
      verifyPassed: false,
      verifyTestsPassed: 8,
      verifyTestsTotal: 9,
    });
    const modelBRun = insertSweRun(db, { modelId: "claude-code:modelB" });
    insertSweResult(db, {
      runId: modelBRun,
      taskType: "fixture",
      verifyPassed: false,
      verifyTestsPassed: 1,
      verifyTestsTotal: 9,
    });

    const data = querySweReportData(db, { allRuns: true });
    const summaryA = data.summaries.find((s) => s.harnessModelId === "claude-code:modelA")!;
    const summaryB = data.summaries.find((s) => s.harnessModelId === "claude-code:modelB")!;

    expect(summaryA.passRate).toBe(0);
    expect(summaryB.passRate).toBe(0);
    expect(summaryA.avgVerifyPassRate).toBeCloseTo(8 / 9, 5);
    expect(summaryB.avgVerifyPassRate).toBeCloseTo(1 / 9, 5);
    expect(summaryA.avgVerifyPassRate!).toBeGreaterThan(summaryB.avgVerifyPassRate!);
  });

  test("avgVerifyPassRate is undefined when no row in the cell has parseable test counts", () => {
    const db = createDb();
    const runId = insertSweRun(db);
    insertSweResult(db, { runId, taskType: "fixture", verifyPassed: true, verifyCommand: "npm test" });

    const data = querySweReportData(db, { allRuns: true });
    const summary = data.summaries.find((s) => s.harnessModelId === "claude-code:haiku")!;
    expect(summary.avgVerifyPassRate).toBeUndefined();
  });

  test("excludes self-judging when the judge id shares the model alias", () => {
    // SWE cells are harness:alias while judges use bench model ids; a judge of
    // anthropic:haiku scoring claude-code:haiku must not inflate the headline.
    const db = createDb();
    const runId = insertSweRun(db);
    insertSweResult(db, { runId, taskType: "fixture", verifyPassed: true });
    insertScore(db, {
      runId,
      judgeModelId: "peer:sonnet",
      score: 2,
      rationale: "peer",
      scoredAt: "t",
      status: "ok",
    });
    insertScore(db, {
      runId,
      judgeModelId: "anthropic:haiku",
      score: 5,
      rationale: "self alias",
      scoredAt: "t",
      status: "ok",
    });
    insertScore(db, {
      runId,
      judgeModelId: "claude-code:haiku",
      score: 5,
      rationale: "exact harness id",
      scoredAt: "t",
      status: "ok",
    });

    const data = querySweReportData(db, { allRuns: true });
    const summary = data.summaries.find((s) => s.harnessModelId === "claude-code:haiku")!;
    expect(summary.avgJudgeScore).toBe(2);
    expect(summary.selfScoreAvg).toBe(5);
  });
});
