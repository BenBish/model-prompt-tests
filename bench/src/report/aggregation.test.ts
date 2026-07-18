import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { insertRun } from "../db/runsRepo";
import { insertScore } from "../db/scoresRepo";
import { queryReportData } from "./queryData";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  return db;
}

describe("queryReportData kind filtering", () => {
  test("excludes SWE-kind runs from the prompt report entirely", () => {
    const db = createDb();
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
    insertRun(db, {
      runBatchId: "batch-1",
      promptId: "swe-tasks/fixture/smoke",
      providerId: "claude-code",
      modelId: "claude-code:haiku",
      modelName: "haiku",
      startedAt: "2026-01-01T00:00:00.000Z",
      status: "ok",
      kind: "swe",
      harnessId: "claude-code",
    });

    const data = queryReportData(db, { allRuns: true });
    expect(data.promptIds).toEqual(["debugging/javascript-debounce"]);
    expect(data.modelIds).toEqual(["anthropic:sonnet"]);
    expect(data.summaries.map((s) => s.modelId)).toEqual(["anthropic:sonnet"]);
  });
});

describe("latest-batch-per-cell (default view)", () => {
  test("keeps all repeats from the latest batch but drops older batches", () => {
    const db = createDb();

    const oldRunId = insertRun(db, {
      runBatchId: "batch-old",
      promptId: "test/prompt",
      providerId: "test",
      modelId: "test:model",
      modelName: "model",
      startedAt: "2026-01-01T00:00:00.000Z",
      outputText: "old output",
      status: "ok",
      repeatIndex: 0,
    });
    insertScore(db, {
      runId: oldRunId,
      judgeModelId: "judge",
      score: 1,
      rationale: "old",
      scoredAt: "2026-01-01T00:00:01.000Z",
      status: "ok",
    });

    for (let repeatIndex = 0; repeatIndex < 3; repeatIndex++) {
      const runId = insertRun(db, {
        runBatchId: "batch-new",
        promptId: "test/prompt",
        providerId: "test",
        modelId: "test:model",
        modelName: "model",
        startedAt: `2026-01-02T00:0${repeatIndex}:00.000Z`,
        outputText: `new output ${repeatIndex}`,
        status: "ok",
        repeatIndex,
      });
      insertScore(db, {
        runId,
        judgeModelId: "judge",
        score: 5,
        rationale: "new",
        scoredAt: `2026-01-02T00:0${repeatIndex}:01.000Z`,
        status: "ok",
      });
    }

    const data = queryReportData(db);
    const rows = data.rows.get("test/prompt")?.get("test:model");
    expect(rows).toHaveLength(3);
    expect(rows?.every((row) => row.runBatchId === "batch-new")).toBe(true);
    db.close();
  });
});

describe("per-run and per-cell score aggregation", () => {
  test("uses the median across judges for a single run", () => {
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
    // Three judges: median of 1, 3, 5 is 3, not the mean-skewed value a bad outlier would produce.
    for (const [judgeId, score] of [
      ["judge-a", 1],
      ["judge-b", 3],
      ["judge-c", 5],
    ] as const) {
      insertScore(db, {
        runId,
        judgeModelId: judgeId,
        score,
        rationale: "r",
        scoredAt: "2026-01-01T00:00:01.000Z",
        status: "ok",
      });
    }

    const data = queryReportData(db, { allRuns: true });
    expect(data.summaries[0]?.avgScore).toBe(3);
    db.close();
  });

  test("averages per-cell medians across repeats rather than flattening all runs", () => {
    const db = createDb();
    // Cell A: two repeats scoring 5 and 1 -> median 3.
    for (const [repeatIndex, score] of [
      [0, 5],
      [1, 1],
    ] as const) {
      const runId = insertRun(db, {
        runBatchId: "batch-1",
        promptId: "test/prompt-a",
        providerId: "test",
        modelId: "test:model",
        modelName: "model",
        startedAt: "2026-01-01T00:00:00.000Z",
        outputText: "output",
        status: "ok",
        repeatIndex,
      });
      insertScore(db, {
        runId,
        judgeModelId: "judge",
        score,
        rationale: "r",
        scoredAt: "2026-01-01T00:00:01.000Z",
        status: "ok",
      });
    }
    // Cell B: single run scoring 5.
    const singleRunId = insertRun(db, {
      runBatchId: "batch-1",
      promptId: "test/prompt-b",
      providerId: "test",
      modelId: "test:model",
      modelName: "model",
      startedAt: "2026-01-01T00:00:00.000Z",
      outputText: "output",
      status: "ok",
    });
    insertScore(db, {
      runId: singleRunId,
      judgeModelId: "judge",
      score: 5,
      rationale: "r",
      scoredAt: "2026-01-01T00:00:01.000Z",
      status: "ok",
    });

    const data = queryReportData(db, { allRuns: true });
    // Cell medians: 3 and 5 -> avgScore = 4. A flat mean of all four runs (5,1,5) would give a
    // different number if cell A had more repeats, which is exactly what per-cell averaging avoids.
    expect(data.summaries[0]?.avgScore).toBe(4);
    expect(data.summaries[0]?.medianScore).toBe(4);
    // Only cell A had >1 run, so repeatVariance reflects only that cell's spread.
    expect(data.summaries[0]?.repeatVariance).toBe(2);
    db.close();
  });
});

describe("judge agreement", () => {
  test("counts only runs with 2+ judges, requiring an exact score match", () => {
    const db = createDb();

    // Run 1: two judges agree (5, 5).
    const run1 = insertRun(db, {
      runBatchId: "batch-1",
      promptId: "test/prompt-a",
      providerId: "test",
      modelId: "test:model",
      modelName: "model",
      startedAt: "2026-01-01T00:00:00.000Z",
      outputText: "output",
      status: "ok",
    });
    insertScore(db, { runId: run1, judgeModelId: "judge-a", score: 5, rationale: "r", scoredAt: "t", status: "ok" });
    insertScore(db, { runId: run1, judgeModelId: "judge-b", score: 5, rationale: "r", scoredAt: "t", status: "ok" });

    // Run 2: two judges disagree (2, 4).
    const run2 = insertRun(db, {
      runBatchId: "batch-1",
      promptId: "test/prompt-b",
      providerId: "test",
      modelId: "test:model",
      modelName: "model",
      startedAt: "2026-01-01T00:00:00.000Z",
      outputText: "output",
      status: "ok",
    });
    insertScore(db, { runId: run2, judgeModelId: "judge-a", score: 2, rationale: "r", scoredAt: "t", status: "ok" });
    insertScore(db, { runId: run2, judgeModelId: "judge-b", score: 4, rationale: "r", scoredAt: "t", status: "ok" });

    // Run 3: single judge, ineligible for the agreement calculation.
    const run3 = insertRun(db, {
      runBatchId: "batch-1",
      promptId: "test/prompt-c",
      providerId: "test",
      modelId: "test:model",
      modelName: "model",
      startedAt: "2026-01-01T00:00:00.000Z",
      outputText: "output",
      status: "ok",
    });
    insertScore(db, { runId: run3, judgeModelId: "judge-a", score: 3, rationale: "r", scoredAt: "t", status: "ok" });

    const data = queryReportData(db, { allRuns: true });
    expect(data.summaries[0]?.judgeAgreementPct).toBe(0.5);
    db.close();
  });
});

describe("dimension averages", () => {
  test("averages per-dimension scores across judges and runs", () => {
    const db = createDb();
    const run1 = insertRun(db, {
      runBatchId: "batch-1",
      promptId: "test/prompt-a",
      providerId: "test",
      modelId: "test:model",
      modelName: "model",
      startedAt: "2026-01-01T00:00:00.000Z",
      outputText: "output",
      status: "ok",
    });
    insertScore(db, {
      runId: run1,
      judgeModelId: "judge",
      score: 4,
      rationale: "r",
      scoredAt: "t",
      status: "ok",
      dimensionScores: {
        correctness: { score: 5, rationale: "great" },
        "code-quality": { score: 3, rationale: "ok" },
      },
      weightedScore: 4.5,
    });
    const run2 = insertRun(db, {
      runBatchId: "batch-1",
      promptId: "test/prompt-b",
      providerId: "test",
      modelId: "test:model",
      modelName: "model",
      startedAt: "2026-01-01T00:00:00.000Z",
      outputText: "output",
      status: "ok",
    });
    insertScore(db, {
      runId: run2,
      judgeModelId: "judge",
      score: 3,
      rationale: "r",
      scoredAt: "t",
      status: "ok",
      dimensionScores: {
        correctness: { score: 3, rationale: "meh" },
        "code-quality": { score: 3, rationale: "ok" },
      },
    });

    const data = queryReportData(db, { allRuns: true });
    expect(data.summaries[0]?.dimensionAverages).toEqual({
      correctness: 4,
      "code-quality": 3,
    });
    const firstRow = data.rows.get("test/prompt-a")?.get("test:model")?.[0];
    expect(firstRow?.judgeResults[0]?.weightedScore).toBe(4.5);
    db.close();
  });
});
