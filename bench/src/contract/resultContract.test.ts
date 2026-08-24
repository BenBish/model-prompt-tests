import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { insertRun } from "../db/runsRepo";
import { insertSweResult } from "../db/sweResultsRepo";
import { insertToolProbeResult } from "../db/toolProbeResultsRepo";
import { insertExperiment } from "../db/experimentsRepo";
import { fingerprintEnvironment, sha256, EXPERIMENT_SCHEMA_VERSION, type ExperimentManifest } from "../experiment/manifest";
import { buildResultContract, RESULT_CONTRACT_VERSION } from "./resultContract";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  return db;
}

function manifestFixture(): ExperimentManifest {
  return {
    schemaVersion: EXPERIMENT_SCHEMA_VERSION,
    createdAt: "2026-08-23T00:00:00.000Z",
    suite: { id: "model-prompt-tests-swe", version: "1" },
    repository: { sha: "abc", dirty: false },
    tasks: [{ id: "swe-tasks/fixture/smoke", sha256: sha256("task") }],
    models: [{ id: "codex-lab:candidate", provider: "codex-lab", model: "candidate" }],
    judges: [],
    harness: { id: "codex-lab", version: "1", config: {} },
    prompts: {},
    limits: {},
    toolPermissions: [],
    plannedRepeats: 1,
    exclusions: [],
    environment: fingerprintEnvironment({ executionDomain: "production-slot-arena", concurrency: 1 }),
  };
}

describe("buildResultContract", () => {
  function seedSwe(
    db: Database,
    options: { batch: string; task: string; status?: "ok" | "error"; experimentId?: string; publication?: "comparable" | "quarantined"; repeatIndex?: number },
  ): number {
    const runId = insertRun(db, {
      runBatchId: options.batch,
      promptId: options.task,
      providerId: "codex-lab",
      modelId: "codex-lab:candidate",
      modelName: "candidate",
      startedAt: `2026-08-23T00:00:0${options.batch.endsWith("2") ? "2" : "1"}.000Z`,
      status: options.status ?? "ok",
      kind: "swe",
      harnessId: "codex-lab",
      repeatIndex: options.repeatIndex,
      experimentId: options.experimentId,
    });
    insertSweResult(db, {
      runId,
      taskType: "fixture",
      verifyPassed: options.status !== "error",
      outcomeCategory: options.status === "error" ? "harness_error" : "passed",
      healthStatus: options.status === "error" ? "infrastructure-failure" : "healthy",
      publicationStatus: options.publication ?? "comparable",
    });
    return runId;
  }

  test("fails closed when the requested batch/model has no evidence", () => {
    const db = createDb();

    expect(() => buildResultContract(db, "missing-batch", "missing-model", "prompt")).toThrow(
      'no prompt evidence found for model "missing-model" in batch "missing-batch"',
    );
  });

  test("fails closed when the requested kind does not match the batch evidence", () => {
    const db = createDb();
    insertRun(db, {
      runBatchId: "prompt-batch",
      promptId: "some-prompt",
      providerId: "local",
      modelId: "local:candidate",
      modelName: "candidate",
      startedAt: "2026-08-23T00:00:00.000Z",
      status: "ok",
      kind: "prompt",
    });

    expect(() => buildResultContract(db, "prompt-batch", "local:candidate", "swe")).toThrow(
      'no swe evidence found for model "local:candidate" in batch "prompt-batch"',
    );
  });

  test("swe contract carries provenance, health, outcome taxonomy, and a primary metric with an interval", () => {
    const db = createDb();
    const experimentId = insertExperiment(db, manifestFixture());
    const modelId = "codex-lab:candidate";
    const runId = insertRun(db, {
      runBatchId: "batch-1",
      promptId: "swe-tasks/fixture/smoke",
      providerId: "codex-lab",
      modelId,
      modelName: "candidate",
      startedAt: "2026-08-23T00:00:00.000Z",
      status: "ok",
      kind: "swe",
      harnessId: "codex-lab",
      experimentId,
    });
    insertSweResult(db, {
      runId,
      taskType: "fixture",
      verifyPassed: true,
      outcomeCategory: "passed",
      healthStatus: "healthy",
      environmentFingerprint: "fp-fedora",
      publicationStatus: "comparable",
    });

    const contract = buildResultContract(db, "batch-1", modelId, "swe");

    expect(contract.schemaVersion).toBe(RESULT_CONTRACT_VERSION);
    expect(contract.legacy).toBe(false);
    expect(contract.experimentId).toBe(experimentId);
    expect(contract.manifestHash).toBe(experimentId);
    expect(contract.environmentFingerprint?.executionDomain).toBe("production-slot-arena");
    expect(contract.health.status).toBe("healthy");
    expect(contract.health.comparableRuns).toBe(1);
    expect(contract.health.quarantinedRuns).toBe(0);
    expect(contract.outcomeCounts.passed).toBe(1);
    expect(contract.metrics.primary?.name).toBe("intentionToEvaluatePassRate");
    expect(contract.metrics.primary?.value).toBe(1);
    expect(contract.metrics.primary?.interval).toBeDefined();
    expect(contract.metrics.secondary.verifyPassed).toBe(1);
    expect(contract.metrics.secondary.verifyFailed).toBe(0);
    expect(contract.metrics.secondary.totalCostUsd).toBe(0);
  });

  test("a batch with no experiment provenance is marked legacy", () => {
    const db = createDb();
    const modelId = "codex-lab:candidate";
    const runId = insertRun(db, {
      runBatchId: "legacy-batch",
      promptId: "swe-tasks/fixture/smoke",
      providerId: "codex-lab",
      modelId,
      modelName: "candidate",
      startedAt: "2026-01-01T00:00:00.000Z",
      status: "ok",
      kind: "swe",
      harnessId: "codex-lab",
    });
    insertSweResult(db, { runId, taskType: "fixture", verifyPassed: true, publicationStatus: "comparable" });

    const contract = buildResultContract(db, "legacy-batch", modelId, "swe");

    expect(contract.legacy).toBe(true);
    expect(contract.experimentId).toBeUndefined();
    expect(contract.environmentFingerprint).toBeUndefined();
  });

  test("an infrastructure-failure health record is never conflated with a healthy one", () => {
    const db = createDb();
    const experimentId = insertExperiment(db, manifestFixture());
    const modelId = "codex-lab:candidate";
    const runId = insertRun(db, {
      runBatchId: "batch-2",
      promptId: "swe-tasks/fixture/smoke",
      providerId: "codex-lab",
      modelId,
      modelName: "candidate",
      startedAt: "2026-08-23T00:00:00.000Z",
      status: "error",
      kind: "swe",
      harnessId: "codex-lab",
      experimentId,
    });
    insertSweResult(db, {
      runId,
      taskType: "fixture",
      outcomeCategory: "harness_error",
      healthStatus: "infrastructure-failure",
      publicationStatus: "quarantined",
    });

    const contract = buildResultContract(db, "batch-2", modelId, "swe");

    expect(contract.health.status).toBe("infrastructure-failure");
    expect(contract.health.quarantinedRuns).toBe(1);
    expect(contract.outcomeCounts.harness_error).toBe(1);
  });

  test("prompt contract reports avgScore without task health (not applicable to prompt suites)", () => {
    const db = createDb();
    const modelId = "local:candidate";
    insertRun(db, {
      runBatchId: "batch-3",
      promptId: "some-prompt",
      providerId: "local",
      modelId,
      modelName: "candidate",
      startedAt: "2026-08-23T00:00:00.000Z",
      status: "ok",
      kind: "prompt",
      outputText: "a real answer",
      outcomeCategory: "passed",
    });

    const contract = buildResultContract(db, "batch-3", modelId, "prompt");

    expect(contract.kind).toBe("prompt");
    expect(contract.health.status).toBe("not-applicable");
    expect(contract.metrics.secondary.emptyRuns).toBe(0);
    expect(contract.metrics.secondary.totalCostUsd).toBe(0);
    expect(contract.metrics.secondary.infrastructureFailures).toBe(0);
    expect(contract.metrics.secondary.candidateFailures).toBe(0);
    expect(contract.outcomeCounts.passed).toBe(1);
  });

  test("tool-probe contract reports wellFormedPct without task health", () => {
    const db = createDb();
    const modelId = "local:candidate";
    const runId = insertRun(db, {
      runBatchId: "batch-4",
      promptId: "case-1",
      providerId: "local",
      modelId,
      modelName: "candidate",
      startedAt: "2026-08-23T00:00:00.000Z",
      status: "ok",
      kind: "prompt",
    });
    insertToolProbeResult(db, { runId, caseId: "case-1", wellFormed: true, correctTool: true, validArgs: false });

    const contract = buildResultContract(db, "batch-4", modelId, "tool-probe");

    expect(contract.kind).toBe("tool-probe");
    expect(contract.health.status).toBe("not-applicable");
    expect(contract.metrics.primary?.name).toBe("wellFormedPct");
    expect(contract.metrics.primary?.value).toBe(100);
    expect(contract.metrics.secondary.validArgs).toBe(0);
  });

  test("composes disjoint SWE cells and records every contributing batch", () => {
    const db = createDb();
    const experimentId = insertExperiment(db, manifestFixture());
    seedSwe(db, { batch: "batch-1", task: "task-a", experimentId });
    seedSwe(db, { batch: "batch-2", task: "task-b", experimentId });

    const contract = buildResultContract(db, ["batch-1", "batch-2"], "codex-lab:candidate", "swe");

    expect(contract.totalRuns).toBe(2);
    expect(contract.okRuns).toBe(2);
    expect(contract.outcomeCounts.passed).toBe(2);
    expect(contract.runBatchIds).toEqual(["batch-1", "batch-2"]);
    expect(contract.artifacts.runBatchIds).toEqual(["batch-1", "batch-2"]);
  });

  test("prefers a completed comparable retry over an interrupted cell", () => {
    const db = createDb();
    const experimentId = insertExperiment(db, manifestFixture());
    seedSwe(db, { batch: "batch-1", task: "task-a", status: "error", publication: "quarantined", experimentId });
    seedSwe(db, { batch: "batch-2", task: "task-a", experimentId });

    const contract = buildResultContract(db, ["batch-1", "batch-2"], "codex-lab:candidate", "swe");

    expect(contract.totalRuns).toBe(1);
    expect(contract.okRuns).toBe(1);
    expect(contract.outcomeCounts).toEqual({ passed: 1 });
    expect(contract.health.comparableRuns).toBe(1);
  });

  test("rejects duplicate completed cells", () => {
    const db = createDb();
    const experimentId = insertExperiment(db, manifestFixture());
    seedSwe(db, { batch: "batch-1", task: "task-a", experimentId });
    seedSwe(db, { batch: "batch-2", task: "task-a", experimentId });

    expect(() => buildResultContract(db, ["batch-1", "batch-2"], "codex-lab:candidate", "swe"))
      .toThrow("duplicate completed swe cell");
  });

  test("rejects semantically incompatible manifests and names the differing path", () => {
    const db = createDb();
    const first = insertExperiment(db, manifestFixture());
    const changed = manifestFixture();
    changed.tasks = [{ id: "different-task", sha256: sha256("different") }];
    const second = insertExperiment(db, changed);
    seedSwe(db, { batch: "batch-1", task: "task-a", experimentId: first });
    seedSwe(db, { batch: "batch-2", task: "task-b", experimentId: second });

    expect(() => buildResultContract(db, ["batch-1", "batch-2"], "codex-lab:candidate", "swe"))
      .toThrow(/incompatible experiment manifests.*tasks/);
  });

  test("rejects mixing legacy and provenance-bearing batches", () => {
    const db = createDb();
    const experimentId = insertExperiment(db, manifestFixture());
    seedSwe(db, { batch: "batch-1", task: "task-a", experimentId });
    seedSwe(db, { batch: "batch-2", task: "task-b" });

    expect(() => buildResultContract(db, ["batch-1", "batch-2"], "codex-lab:candidate", "swe"))
      .toThrow("cannot mix legacy and provenance-bearing batches");
  });

  test("rejects an unknown id in a multi-batch request", () => {
    const db = createDb();
    seedSwe(db, { batch: "batch-1", task: "task-a" });

    expect(() => buildResultContract(db, ["batch-1", "missing"], "codex-lab:candidate", "swe"))
      .toThrow('no swe evidence found for model "codex-lab:candidate" in batch "missing"');
  });
});
