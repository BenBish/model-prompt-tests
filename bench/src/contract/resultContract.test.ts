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
    });

    const contract = buildResultContract(db, "batch-3", modelId, "prompt");

    expect(contract.kind).toBe("prompt");
    expect(contract.health.status).toBe("not-applicable");
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
});
