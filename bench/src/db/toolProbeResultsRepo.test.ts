import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { insertRun } from "./runsRepo";
import { getToolProbeResultForRun, getToolProbeResultsForBatch, insertToolProbeResult } from "./toolProbeResultsRepo";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  return db;
}

function insertTestRun(db: Database, overrides: Partial<Parameters<typeof insertRun>[1]> = {}): number {
  return insertRun(db, {
    runBatchId: "batch-1",
    promptId: "hermes-tools/set-reminder-basic",
    providerId: "llamacpp",
    modelId: "local:hermes-test",
    modelName: "test-model",
    startedAt: "2026-01-01T00:00:00.000Z",
    status: "ok",
    ...overrides,
  });
}

describe("toolProbeResultsRepo", () => {
  test("round-trips a full tool probe result", () => {
    const db = createDb();
    const runId = insertTestRun(db);

    insertToolProbeResult(db, {
      runId,
      caseId: "set-reminder-basic",
      expectedTool: "set_reminder",
      wellFormed: true,
      correctTool: true,
      validArgs: true,
      calledTool: "set_reminder",
      argumentsRaw: '{"time":"9am","message":"x"}',
    });

    const row = getToolProbeResultForRun(db, runId);
    expect(row?.caseId).toBe("set-reminder-basic");
    expect(row?.wellFormed).toBe(true);
    expect(row?.correctTool).toBe(true);
    expect(row?.validArgs).toBe(true);
    expect(row?.calledTool).toBe("set_reminder");
  });

  test("stores false booleans as false, not just falsy-omitted", () => {
    const db = createDb();
    const runId = insertTestRun(db);
    insertToolProbeResult(db, {
      runId,
      caseId: "negative-case",
      wellFormed: true,
      correctTool: false,
      validArgs: false,
      calledTool: "send_message",
      notes: "called a tool when none was expected",
    });

    const row = getToolProbeResultForRun(db, runId);
    expect(row?.correctTool).toBe(false);
    expect(row?.validArgs).toBe(false);
    expect(row?.notes).toContain("none was expected");
  });

  test("returns undefined for a run with no probe result", () => {
    const db = createDb();
    const runId = insertTestRun(db);
    expect(getToolProbeResultForRun(db, runId)).toBeUndefined();
  });

  test("fetches all probe results for a batch across multiple runs", () => {
    const db = createDb();
    const run1 = insertTestRun(db, { promptId: "hermes-tools/case-a" });
    const run2 = insertTestRun(db, { promptId: "hermes-tools/case-b" });
    insertTestRun(db, { runBatchId: "batch-other", promptId: "hermes-tools/case-c" });

    insertToolProbeResult(db, { runId: run1, caseId: "case-a", wellFormed: true, correctTool: true, validArgs: true });
    insertToolProbeResult(db, { runId: run2, caseId: "case-b", wellFormed: false, correctTool: false, validArgs: false });

    const rows = getToolProbeResultsForBatch(db, "batch-1");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.caseId).sort()).toEqual(["case-a", "case-b"]);
  });

  test("cascades delete when the parent run is removed", () => {
    const db = createDb();
    db.exec("PRAGMA foreign_keys = ON;");
    const runId = insertTestRun(db);
    insertToolProbeResult(db, { runId, caseId: "case-a", wellFormed: true, correctTool: true, validArgs: true });

    db.prepare("DELETE FROM runs WHERE id = $id").run({ $id: runId });
    expect(getToolProbeResultForRun(db, runId)).toBeUndefined();
  });
});
