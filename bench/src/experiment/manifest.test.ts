import { describe, expect, test } from "bun:test";
import { compareExperiments } from "./compatibility";
import { canonicalJson, fingerprintEnvironment, manifestId, publicationIssues, sha256, type ExperimentManifest } from "./manifest";
import { validateModelsConfig } from "../config/modelConfig";

function fixture(domain = "interactive-lab"): ExperimentManifest {
  return { schemaVersion: 1, createdAt: "2026-08-23T00:00:00.000Z", suite: { id: "bench", version: "1" }, repository: { sha: "abc", dirty: true }, tasks: [{ id: "task", sha256: sha256("prompt") }], models: [{ id: "local:model", provider: "local", model: "model", weightsSha256: "weights" }], judges: [{ id: "rubric", modelId: "judge", sha256: "rubric-hash" }], harness: { id: "bun", version: "1", config: {} }, prompts: { system: "system" }, limits: { output: 100 }, toolPermissions: [], plannedRepeats: 2, exclusions: [], environment: fingerprintEnvironment({ executionDomain: domain, concurrency: 1, os: { platform: domain === "interactive-lab" ? "linux-omarchy" : "linux-fedora", kernel: "6.0" }, cpu: "fixture-cpu", memoryBytes: 128, productionServices: domain === "interactive-lab" ? "co-resident" : "stopped" }) };
}

describe("experiment manifests", () => {
  test("canonical hashing ignores object insertion order", () => { expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}'); expect(manifestId(fixture())).toBe(manifestId(JSON.parse(canonicalJson(fixture())))); });
  test("dirty worktree state is content-addressed", () => { const clean = fixture(); clean.repository.dirty = false; expect(manifestId(clean)).not.toBe(manifestId(fixture())); });
  test("local aliases need immutable identity for publication", () => { const manifest = fixture(); delete manifest.models[0]!.weightsSha256; expect(publicationIssues(manifest)).toEqual(["model local:model lacks weightsSha256 or immutableRevision"]); });
  test("model config accepts cached local immutable identity", () => { const config = validateModelsConfig({ models: [{ id: "LAB-CANDIDATE", kind: "openai-compatible", providerId: "local", modelName: "alias", baseUrl: "http://localhost", weightsSha256: "abc", immutableRevision: "upstream/rev", quantization: "Q4" }], judge: { modelId: "LAB-CANDIDATE" } }); expect(config.models[0]).toMatchObject({ weightsSha256: "abc", immutableRevision: "upstream/rev", quantization: "Q4" }); });
  test("domain differences retain quality compatibility but reject performance pooling", () => { const result = compareExperiments(fixture("interactive-lab"), fixture("production-slot-arena")); expect(result.compatible).toBe(true); expect(result.performanceComparable).toBe(false); expect(result.comparableMetricFamilies).toEqual(["quality", "correctness"]); expect(result.differences.every((d) => d.category === "environment")).toBe(true); });
  test("changed prompt hashes are semantically incompatible", () => { const changed = fixture(); changed.tasks[0]!.sha256 = "changed"; expect(compareExperiments(fixture(), changed).compatible).toBe(false); });
});
