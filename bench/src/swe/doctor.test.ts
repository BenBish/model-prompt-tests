import { describe, expect, test } from "bun:test";
import type { BenchModelsConfig } from "../config/modelConfig";
import type { HarnessMatrixEntry } from "./harnessConfig";
import type { SweHarness, SweHarnessInput, SweHarnessResult } from "./harness/types";
import { DOCTOR_PROMPT, formatDoctorReport, runSweDoctor } from "./doctor";

function fakeHarness(result: Partial<SweHarnessResult> & { available?: boolean; reason?: string }): SweHarness {
  return {
    harnessId: "fake",
    kind: "fake",
    resolveModel: (alias) => (alias === "m" ? "native-m" : undefined),
    async available() {
      return result.available === false
        ? { ok: false, reason: result.reason ?? "missing" }
        : { ok: true };
    },
    async run(_input: SweHarnessInput): Promise<SweHarnessResult> {
      return {
        finalMessage: result.finalMessage ?? "pong",
        exitCode: result.exitCode ?? 0,
        latencyMs: result.latencyMs ?? 12,
        timedOut: result.timedOut ?? false,
        raw: {},
      };
    },
  };
}

const modelsConfig: BenchModelsConfig = {
  models: [
    {
      id: "local:test",
      kind: "openai-compatible",
      providerId: "local",
      modelName: "test",
      baseUrl: "http://localhost:1",
    },
  ],
  judge: { modelId: "local:test" },
};

describe("runSweDoctor", () => {
  test("reports OK when harness is available and run succeeds", async () => {
    const entry: HarnessMatrixEntry = {
      id: "fake",
      kind: "claude-code",
      models: { m: "native-m" },
    };
    const results = await runSweDoctor([entry], modelsConfig, () => fakeHarness({ finalMessage: "pong" }));
    expect(results).toHaveLength(1);
    expect(results[0]!.ok).toBe(true);
    expect(results[0]!.finalMessagePreview).toBe("pong");
    expect(formatDoctorReport(results)).toContain("[OK]");
  });

  test("reports FAIL when unavailable", async () => {
    const entry: HarnessMatrixEntry = {
      id: "gone",
      kind: "codex",
      models: { m: "native-m" },
    };
    const results = await runSweDoctor(
      [entry],
      modelsConfig,
      () => fakeHarness({ available: false, reason: "not found on PATH" }),
    );
    expect(results[0]!.ok).toBe(false);
    expect(results[0]!.error).toContain("not found");
  });

  test("reports FAIL when finalMessage is empty (parse drift)", async () => {
    const entry: HarnessMatrixEntry = {
      id: "empty",
      kind: "claude-code",
      models: { m: "native-m" },
    };
    const results = await runSweDoctor(
      [entry],
      modelsConfig,
      () => fakeHarness({ finalMessage: "   ", exitCode: 0 }),
    );
    expect(results[0]!.ok).toBe(false);
    expect(results[0]!.error).toContain("empty finalMessage");
  });

  test("doctor prompt is stable", () => {
    expect(DOCTOR_PROMPT).toContain("pong");
  });
});
