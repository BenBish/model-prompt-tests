import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { insertRun } from "../db/runsRepo";
import { insertSweResult } from "../db/sweResultsRepo";
import { insertScore } from "../db/scoresRepo";
import { insertExperiment } from "../db/experimentsRepo";
import { fingerprintEnvironment, sha256, EXPERIMENT_SCHEMA_VERSION, type ExperimentManifest } from "../experiment/manifest";
import { buildPairedContract, PAIRED_CONTRACT_VERSION } from "./pairedContract";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  return db;
}

function manifestFixture(overrides: Partial<ExperimentManifest> = {}): ExperimentManifest {
  return {
    schemaVersion: EXPERIMENT_SCHEMA_VERSION,
    createdAt: "2026-08-23T00:00:00.000Z",
    suite: { id: "model-prompt-tests-swe", version: "1" },
    repository: { sha: "abc", dirty: false },
    tasks: [
      { id: "swe-tasks/fixture/a", sha256: sha256("a") },
      { id: "swe-tasks/fixture/b", sha256: sha256("b") },
    ],
    models: [{ id: "codex-lab:candidate", provider: "codex-lab", model: "candidate" }],
    judges: [],
    harness: { id: "codex-lab", version: "1", config: {} },
    prompts: {},
    limits: {},
    toolPermissions: [],
    plannedRepeats: 1,
    exclusions: [],
    environment: fingerprintEnvironment({ executionDomain: "production-slot-arena", concurrency: 1 }),
    ...overrides,
  };
}

function seedSwe(
  db: Database,
  options: { batch: string; task: string; modelId: string; passed: boolean; experimentId?: string; publication?: "comparable" | "quarantined" },
): number {
  const runId = insertRun(db, {
    runBatchId: options.batch,
    promptId: options.task,
    providerId: "codex-lab",
    modelId: options.modelId,
    modelName: options.modelId,
    startedAt: "2026-08-23T00:00:00.000Z",
    status: "ok",
    kind: "swe",
    harnessId: "codex-lab",
    experimentId: options.experimentId,
  });
  insertSweResult(db, {
    runId,
    taskType: "fixture",
    verifyPassed: options.passed,
    outcomeCategory: options.passed ? "passed" : "candidate_failure",
    healthStatus: "healthy",
    publicationStatus: options.publication ?? "comparable",
  });
  return runId;
}

function seedPrompt(db: Database, options: { batch: string; task: string; modelId: string; score: number; experimentId?: string }): number {
  const runId = insertRun(db, {
    runBatchId: options.batch,
    promptId: options.task,
    providerId: "local",
    modelId: options.modelId,
    modelName: options.modelId,
    startedAt: "2026-08-23T00:00:00.000Z",
    status: "ok",
    kind: "prompt",
    outcomeCategory: "passed",
    experimentId: options.experimentId,
  });
  insertScore(db, { runId, judgeModelId: "judge:x", score: options.score, scoredAt: "2026-08-23T00:00:01.000Z", status: "ok" });
  return runId;
}

describe("buildPairedContract", () => {
  test("fails closed when the candidate has no evidence", () => {
    const db = createDb();
    seedSwe(db, { batch: "base-batch", task: "swe-tasks/fixture/a", modelId: "incumbent", passed: true });

    expect(() =>
      buildPairedContract(db, "swe", { runBatchId: "missing", modelId: "cand" }, { runBatchId: "base-batch", modelId: "incumbent" }),
    ).toThrow('no swe evidence found for model "cand" in batch "missing"');
  });

  test("fails closed when the baseline has no evidence", () => {
    const db = createDb();
    seedSwe(db, { batch: "cand-batch", task: "swe-tasks/fixture/a", modelId: "cand", passed: true });

    expect(() =>
      buildPairedContract(db, "swe", { runBatchId: "cand-batch", modelId: "cand" }, { runBatchId: "missing", modelId: "incumbent" }),
    ).toThrow('no swe evidence found for model "incumbent" in batch "missing"');
  });

  test("computes a matched-task hierarchical-bootstrap comparison for compatible SWE manifests", () => {
    const db = createDb();
    const experimentId = insertExperiment(db, manifestFixture());
    for (const task of ["swe-tasks/fixture/a", "swe-tasks/fixture/b"]) {
      seedSwe(db, { batch: "cand-batch", task, modelId: "cand", passed: true, experimentId });
      seedSwe(db, { batch: "base-batch", task, modelId: "incumbent", passed: false, experimentId });
    }

    const contract = buildPairedContract(
      db, "swe",
      { runBatchId: "cand-batch", modelId: "cand" },
      { runBatchId: "base-batch", modelId: "incumbent" },
      { minimumMatchedTasks: 2 },
    );

    expect(contract.schemaVersion).toBe(PAIRED_CONTRACT_VERSION);
    expect(contract.kind).toBe("swe");
    expect(contract.compatibility.status).toBe("compatible");
    expect(contract.compatibility.performanceComparable).toBe(true);
    expect(contract.comparison.matchedTasks).toBe(2);
    expect(contract.comparison.unionTasks).toBe(2);
    expect(contract.comparison.baselineId).toBe("incumbent");
    expect(contract.comparison.candidateId).toBe("cand");
    expect(contract.comparison.delta).toBe(1);
    expect(contract.comparison.interval.low).toBeGreaterThan(0);
    expect(contract.comparison.verdict).toBe("win");
    expect(contract.candidate.totalRuns).toBe(2);
    expect(contract.candidate.taskCoveragePct).toBe(100);
    expect(contract.baseline.taskCoveragePct).toBe(100);
  });

  test("marks incompatible manifests and suppresses the verdict, naming the differing path", () => {
    const db = createDb();
    const baseExperiment = insertExperiment(db, manifestFixture());
    const candExperiment = insertExperiment(db, manifestFixture({ tasks: [{ id: "different-task", sha256: sha256("different") }] }));
    seedSwe(db, { batch: "cand-batch", task: "swe-tasks/fixture/a", modelId: "cand", passed: true, experimentId: candExperiment });
    seedSwe(db, { batch: "base-batch", task: "swe-tasks/fixture/a", modelId: "incumbent", passed: false, experimentId: baseExperiment });

    const contract = buildPairedContract(
      db, "swe",
      { runBatchId: "cand-batch", modelId: "cand" },
      { runBatchId: "base-batch", modelId: "incumbent" },
    );

    expect(contract.compatibility.status).toBe("incompatible");
    expect(contract.compatibility.differences.some((d) => d.path === "tasks")).toBe(true);
    expect(contract.comparison.verdict).toBe("inconclusive");
    expect(contract.comparison.warnings.some((w) => w.includes("incompatible experiments"))).toBe(true);
  });

  test("marks compatibility unknown, never assumed compatible, when a manifest is missing (legacy batch)", () => {
    const db = createDb();
    seedSwe(db, { batch: "cand-batch", task: "swe-tasks/fixture/a", modelId: "cand", passed: true });
    seedSwe(db, { batch: "base-batch", task: "swe-tasks/fixture/a", modelId: "incumbent", passed: false });

    const contract = buildPairedContract(
      db, "swe",
      { runBatchId: "cand-batch", modelId: "cand" },
      { runBatchId: "base-batch", modelId: "incumbent" },
    );

    expect(contract.compatibility.status).toBe("unknown");
    expect(contract.comparison.verdict).toBe("inconclusive");
    expect(contract.candidate.taskCoveragePct).toBeUndefined();
  });

  test("computes a paired score comparison for prompt/judged runs", () => {
    const db = createDb();
    const experimentId = insertExperiment(db, manifestFixture({ tasks: [{ id: "hermes/p1", sha256: sha256("p1") }, { id: "hermes/p2", sha256: sha256("p2") }] }));
    seedPrompt(db, { batch: "cand-batch", task: "hermes/p1", modelId: "cand", score: 4.5, experimentId });
    seedPrompt(db, { batch: "cand-batch", task: "hermes/p2", modelId: "cand", score: 4.7, experimentId });
    seedPrompt(db, { batch: "base-batch", task: "hermes/p1", modelId: "incumbent", score: 4.0, experimentId });
    seedPrompt(db, { batch: "base-batch", task: "hermes/p2", modelId: "incumbent", score: 4.1, experimentId });

    const contract = buildPairedContract(
      db, "prompt",
      { runBatchId: "cand-batch", modelId: "cand" },
      { runBatchId: "base-batch", modelId: "incumbent" },
      { practicalEquivalence: 0.15 },
    );

    expect(contract.kind).toBe("prompt");
    expect(contract.comparison.matchedTasks).toBe(2);
    expect(contract.comparison.delta).toBeCloseTo(0.55, 5);
    expect(contract.candidate.judgeCoveragePct).toBe(100);
    expect(contract.baseline.judgeCoveragePct).toBe(100);
  });

  test("does not coerce judge coverage to zero for SWE, where grading is not applicable", () => {
    const db = createDb();
    const experimentId = insertExperiment(db, manifestFixture());
    seedSwe(db, { batch: "cand-batch", task: "swe-tasks/fixture/a", modelId: "cand", passed: true, experimentId });
    seedSwe(db, { batch: "base-batch", task: "swe-tasks/fixture/a", modelId: "incumbent", passed: false, experimentId });

    const contract = buildPairedContract(
      db, "swe",
      { runBatchId: "cand-batch", modelId: "cand" },
      { runBatchId: "base-batch", modelId: "incumbent" },
    );

    expect(contract.candidate.judgeCoveragePct).toBeUndefined();
    expect(contract.baseline.judgeCoveragePct).toBeUndefined();
  });
});
