import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { insertRun } from "../db/runsRepo";
import { insertScore } from "../db/scoresRepo";
import type { BenchModelsConfig } from "../config/modelConfig";
import { exportBatch, validateExportName } from "./exportBatch";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  return db;
}

const config: BenchModelsConfig = {
  models: [
    {
      id: "test:sonnet",
      kind: "anthropic",
      modelName: "claude-test",
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
    },
    {
      id: "test:gpt",
      kind: "openai-compatible",
      providerId: "openai",
      modelName: "gpt-test",
      baseUrl: "https://api.openai.com/v1",
      reasoningEffort: "medium",
      maxConcurrent: 2,
    },
  ],
  judge: { modelId: "test:sonnet" },
};

const tempRoots: string[] = [];
afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

function seedBatch(db: Database, runBatchId: string): void {
  const startedAt = "2026-07-13T00:00:00.000Z";
  const runA = insertRun(db, {
    runBatchId,
    promptId: "writing/press-release",
    providerId: "anthropic",
    modelId: "test:sonnet",
    modelName: "claude-test",
    startedAt,
    latencyMs: 1200,
    inputTokens: 500,
    outputTokens: 300,
    outputText: "Sonnet output",
    status: "ok",
    costUsd: 0.005,
    stopReason: "stop",
  });
  insertScore(db, {
    runId: runA,
    judgeModelId: "test:gpt",
    score: 4,
    rationale: "Good",
    scoredAt: startedAt,
    status: "ok",
  });

  const runB = insertRun(db, {
    runBatchId,
    promptId: "writing/press-release",
    providerId: "openai",
    modelId: "test:gpt",
    modelName: "gpt-test",
    startedAt,
    latencyMs: 800,
    inputTokens: 400,
    outputTokens: 200,
    outputText: "GPT output",
    status: "ok",
    costUsd: 0.002,
    stopReason: "length",
  });
  insertScore(db, {
    runId: runB,
    judgeModelId: "test:sonnet",
    scoredAt: startedAt,
    status: "error",
    error: "judge did not return a valid JSON score after 2 attempts",
  });
}

describe("validateExportName", () => {
  test("accepts lowercase kebab-case names", () => {
    expect(() => validateExportName("grok-45-vs-sonnet-5")).not.toThrow();
  });

  test("rejects names with uppercase, spaces, or slashes", () => {
    expect(() => validateExportName("Grok Vs Sonnet")).toThrow();
    expect(() => validateExportName("../escape")).toThrow();
    expect(() => validateExportName("")).toThrow();
  });
});

describe("exportBatch", () => {
  test("throws when the batch has no runs", async () => {
    const db = createDb();
    const root = mkdtempSync(join(tmpdir(), "bench-export-"));
    tempRoots.push(root);

    await expect(
      exportBatch({ db, config, runBatchId: "missing-batch", name: "empty", outDir: join(root, "empty") }),
    ).rejects.toThrow('no runs found for batch "missing-batch"');
  });

  test("writes the full export package with correct content", async () => {
    const db = createDb();
    seedBatch(db, "batch-1");
    const root = mkdtempSync(join(tmpdir(), "bench-export-"));
    tempRoots.push(root);
    const outDir = join(root, "demo-run");

    const result = await exportBatch({
      db,
      config,
      runBatchId: "batch-1",
      name: "demo-run",
      outDir,
      generatedAt: "2026-07-13T01:00:00.000Z",
    });

    expect(result.files.sort()).toEqual(
      [
        "summary.json",
        "raw-outputs-and-scores.json",
        "per-prompt-results.md",
        "run-config.md",
        "report.html",
        "data.json",
        "article.md",
        "x-thread.md",
      ].sort(),
    );

    const summary = JSON.parse(readFileSync(join(outDir, "summary.json"), "utf8"));
    expect(summary).toHaveLength(2);
    const sonnetSummary = summary.find((s: { modelId: string }) => s.modelId === "test:sonnet");
    expect(sonnetSummary.avgScore).toBe(4);
    expect(sonnetSummary.totalCostUsd).toBeCloseTo(0.005);
    expect(sonnetSummary.truncatedRuns).toBe(0);
    const gptSummary = summary.find((s: { modelId: string }) => s.modelId === "test:gpt");
    expect(gptSummary.truncatedRuns).toBe(1);

    const raw = JSON.parse(readFileSync(join(outDir, "raw-outputs-and-scores.json"), "utf8"));
    expect(raw).toHaveLength(2);
    expect(raw[0].judge_scores).toBeInstanceOf(Array);
    expect(raw.find((r: { model_id: string }) => r.model_id === "test:gpt").judge_scores[0]).toMatchObject({
      judge_model_id: "test:sonnet",
      status: "error",
    });

    const runConfig = readFileSync(join(outDir, "run-config.md"), "utf8");
    expect(runConfig).toContain("batch-1");
    expect(runConfig).toContain("test:sonnet");
    expect(runConfig).toContain("reasoningEffort: medium");
    expect(runConfig).toContain("Judge failures: 1");

    const perPrompt = readFileSync(join(outDir, "per-prompt-results.md"), "utf8");
    expect(perPrompt).toContain("writing/press-release");
    expect(perPrompt).toContain("Judge Failure Rows");

    const site = JSON.parse(readFileSync(join(outDir, "data.json"), "utf8"));
    expect(site.name).toBe("demo-run");
    expect(site.runBatchId).toBe("batch-1");
    expect(site.modelIds.sort()).toEqual(["test:gpt", "test:sonnet"]);

    const reportHtml = readFileSync(join(outDir, "report.html"), "utf8");
    expect(reportHtml).toContain("<!doctype html>");
    expect(reportHtml).toContain("test:sonnet");

    const article = readFileSync(join(outDir, "article.md"), "utf8");
    expect(article).toContain("Demo Run");
    db.close();
  });

  test("rejects an unsafe export name before writing anything", async () => {
    const db = createDb();
    seedBatch(db, "batch-1");
    const root = mkdtempSync(join(tmpdir(), "bench-export-"));
    tempRoots.push(root);

    await expect(
      exportBatch({ db, config, runBatchId: "batch-1", name: "../escape", outDir: join(root, "x") }),
    ).rejects.toThrow();
  });
});
