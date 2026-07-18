import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { insertRun } from "./runsRepo";
import { getSweResultForRun, insertSweResult } from "./sweResultsRepo";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  return db;
}

function insertTestRun(db: Database): number {
  return insertRun(db, {
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
}

describe("sweResultsRepo", () => {
  test("round-trips a full SWE result record", () => {
    const db = createDb();
    const runId = insertTestRun(db);

    insertSweResult(db, {
      runId,
      taskType: "fixture",
      workdir: "/tmp/workspaces/batch-1/cell",
      baselineSha: "abc123",
      diffPatch: "diff --git a/x b/x\n",
      filesChanged: 1,
      linesAdded: 2,
      linesRemoved: 1,
      transcript: "agent transcript",
      agentExitCode: 0,
      agentTimedOut: false,
      verifyCommand: "bun test",
      verifyExitCode: 0,
      verifyPassed: true,
      verifyOutput: "2 pass",
      verifyDurationMs: 123,
      reviewMetrics: { recall: 0.5 },
      error: undefined,
    });

    const row = getSweResultForRun(db, runId);
    expect(row?.taskType).toBe("fixture");
    expect(row?.baselineSha).toBe("abc123");
    expect(row?.filesChanged).toBe(1);
    expect(row?.verifyPassed).toBe(true);
    expect(row?.agentTimedOut).toBe(false);
    expect(row?.reviewMetrics).toEqual({ recall: 0.5 });
    db.close();
  });

  test("distinguishes verifyPassed=false from not-yet-verified (undefined)", () => {
    const db = createDb();
    const runId = insertTestRun(db);
    insertSweResult(db, { runId, taskType: "fixture", verifyPassed: false });

    const row = getSweResultForRun(db, runId);
    expect(row?.verifyPassed).toBe(false);
    db.close();
  });

  test("returns undefined for a run with no SWE result", () => {
    const db = createDb();
    const runId = insertTestRun(db);
    expect(getSweResultForRun(db, runId)).toBeUndefined();
    db.close();
  });

  test("cascades delete when the parent run is removed", () => {
    const db = createDb();
    db.exec("PRAGMA foreign_keys = ON;");
    const runId = insertTestRun(db);
    insertSweResult(db, { runId, taskType: "fixture" });

    db.prepare("DELETE FROM runs WHERE id = $id").run({ $id: runId });
    expect(getSweResultForRun(db, runId)).toBeUndefined();
    db.close();
  });
});
