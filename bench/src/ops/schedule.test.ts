import { describe, expect, test } from "bun:test";
import { budgetExceeded, cellKey, interruptedVerdict, pendingCells, validateScheduleContract } from "./schedule";

const budget = { maxCalls: 10, maxTokens: 10_000, maxCostUsd: 5, maxElapsedMs: 60_000, maxConcurrency: 2 };
describe("scheduled-run orchestration contract", () => {
  test("requires a live Halo lease for Fedora but never for generic CI", () => {
    const generic = { schemaVersion: 1 as const, runId: "nightly", executionDomain: "generic-ci" as const, requiredResources: ["cpu"], budget };
    expect(validateScheduleContract(generic)).toEqual([]);
    expect(validateScheduleContract({ ...generic, executionDomain: "fedora-production-slot" })).toContain("Fedora execution requires a Halo-owned lease token");
  });
  test("rejects malformed runtime JSON instead of bypassing lease checks", () => {
    expect(validateScheduleContract({ schemaVersion: 1, runId: "x", executionDomain: "fedora-ish", requiredResources: ["cpu"], budget })).toContain("executionDomain is invalid");
    expect(validateScheduleContract({ schemaVersion: 1, runId: "x", executionDomain: "fedora-production-slot", requiredResources: ["gpu"], budget, lease: { owner: "halo-maxxing", token: "token", expiresAt: "not-a-date" } })).toContain("Halo lease expiry is invalid");
    expect(validateScheduleContract({})).toContain("budget must be an object");
  });
  test("resumption deduplicates planned cells", () => {
    const a = { taskId: "a", modelId: "m", repeatIndex: 0 }; const b = { taskId: "b", modelId: "m", repeatIndex: 0 };
    expect(pendingCells([a, a, b], [cellKey(a)])).toEqual([b]);
  });
  test("caps budgets and never records a Fedora candidate loss", () => {
    expect(budgetExceeded(budget, { calls: 10, tokens: 1, costUsd: 1, elapsedMs: 1 })).toEqual(["model calls"]);
    expect(interruptedVerdict("fedora-production-slot")).toBe("invalid/inconclusive");
  });
});
