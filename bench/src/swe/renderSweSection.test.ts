import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { insertRun } from "../db/runsRepo";
import { insertSweResult } from "../db/sweResultsRepo";
import { querySweReportData } from "./sweReportData";
import { renderSweReportSection } from "./renderSweSection";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  return db;
}

describe("renderSweReportSection", () => {
  test("returns an empty string when there is no SWE data", () => {
    const db = createDb();
    const data = querySweReportData(db, { allRuns: true });
    expect(renderSweReportSection(data)).toBe("");
  });

  test("renders the summary and detail tables with pass/fail badges", () => {
    const db = createDb();
    const runId = insertRun(db, {
      runBatchId: "batch-1",
      promptId: "swe-tasks/fixture/smoke",
      providerId: "claude-code",
      modelId: "claude-code:haiku",
      modelName: "claude-haiku",
      startedAt: "2026-01-01T00:00:00.000Z",
      status: "ok",
      kind: "swe",
      harnessId: "claude-code",
      outputText: "Fixed the bug",
    });
    insertSweResult(db, {
      runId,
      taskType: "fixture",
      diffPatch: "diff --git a/x b/x\n+fixed",
      verifyCommand: "bun test",
      verifyPassed: true,
      verifyOutput: "2 pass",
    });

    const data = querySweReportData(db, { allRuns: true });
    const html = renderSweReportSection(data);

    expect(html).toContain("SWE Task Summary");
    expect(html).toContain("SWE Task Details");
    expect(html).toContain("swe-tasks/fixture/smoke");
    expect(html).toContain("claude-code:haiku");
    expect(html).toContain(">pass<");
    expect(html).toContain("Fixed the bug");
    expect(html).toContain("2 pass");
  });

  test("escapes untrusted content in the diff and verify output", () => {
    const db = createDb();
    const runId = insertRun(db, {
      runBatchId: "batch-1",
      promptId: "swe-tasks/fixture/smoke",
      providerId: "claude-code",
      modelId: "claude-code:haiku",
      modelName: "claude-haiku",
      startedAt: "2026-01-01T00:00:00.000Z",
      status: "ok",
      kind: "swe",
      harnessId: "claude-code",
    });
    insertSweResult(db, {
      runId,
      taskType: "fixture",
      diffPatch: "<script>alert(1)</script>",
      verifyPassed: false,
      verifyOutput: "<img src=x onerror=alert(1)>",
    });

    const data = querySweReportData(db, { allRuns: true });
    const html = renderSweReportSection(data);

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain(">fail<");
  });
});
