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
    expect(summary.avgJudgeScore).toBe(4);
    expect(summary.avgAgentLatencyMs).toBe(1500);
    expect(summary.avgDiffLines).toBe(2);
    expect(summary.timeouts).toBe(1);
  });

  test("passRate is undefined when no ok runs have a verify result yet", () => {
    const db = createDb();
    insertSweRun(db, { status: "error", error: "boom" });

    const data = querySweReportData(db, { allRuns: true });
    const summary = data.summaries.find((s) => s.harnessModelId === "claude-code:haiku")!;
    expect(summary.passRate).toBeUndefined();
  });
});
