import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  enabledHarnessMatrix,
  findHarness,
  loadHarnessesConfig,
  validateHarnessesConfig,
  type BenchHarnessesConfig,
} from "./harnessConfig";

const tempRoots: string[] = [];

function validConfig(): BenchHarnessesConfig {
  return {
    harnesses: [
      { id: "claude-code", kind: "claude-code", models: { sonnet: "claude-sonnet-5" }, maxTurns: 60 },
      { id: "raw-api", kind: "raw-api", maxContextBytes: 100_000 },
      { id: "disabled-harness", kind: "raw-api", enabled: false },
    ],
  };
}

function makeTempRepo(example: unknown = validConfig()): string {
  const root = mkdtempSync(join(tmpdir(), "bench-harness-config-"));
  tempRoots.push(root);
  mkdirSync(join(root, "bench"), { recursive: true });
  writeFileSync(join(root, "bench", "harnesses.example.json"), `${JSON.stringify(example, null, 2)}\n`);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe("validateHarnessesConfig", () => {
  test("accepts a valid config", () => {
    const config = validateHarnessesConfig(validConfig());
    expect(config.harnesses).toHaveLength(3);
  });

  test("rejects an empty harnesses array", () => {
    expect(() => validateHarnessesConfig({ harnesses: [] })).toThrow(
      'must contain a non-empty "harnesses" array',
    );
  });

  test("rejects duplicate harness ids", () => {
    const config = validConfig();
    config.harnesses.push({ id: "claude-code", kind: "raw-api" });
    expect(() => validateHarnessesConfig(config)).toThrow('duplicate harness id "claude-code"');
  });

  test("rejects an unsupported kind", () => {
    expect(() => validateHarnessesConfig({ harnesses: [{ id: "x", kind: "codex" }] })).toThrow(
      'unsupported kind "codex"',
    );
  });

  test("requires a non-empty models map for claude-code", () => {
    expect(() =>
      validateHarnessesConfig({ harnesses: [{ id: "cc", kind: "claude-code", models: {} }] }),
    ).toThrow('"models" must have at least one entry');
  });

  test("does not require a models map for raw-api", () => {
    const config = validateHarnessesConfig({ harnesses: [{ id: "raw-api", kind: "raw-api" }] });
    expect(config.harnesses[0]).toEqual({ id: "raw-api", kind: "raw-api" });
  });
});

describe("loadHarnessesConfig", () => {
  test("falls back to the example file when no local config exists", async () => {
    const root = makeTempRepo();
    const { config, isLocal, sourcePath } = await loadHarnessesConfig(root);
    expect(isLocal).toBe(false);
    expect(sourcePath).toContain("harnesses.example.json");
    expect(config.harnesses).toHaveLength(3);
  });

  test("prefers a local harnesses.json over the example", async () => {
    const root = makeTempRepo();
    writeFileSync(
      join(root, "bench", "harnesses.json"),
      `${JSON.stringify({ harnesses: [{ id: "only-local", kind: "raw-api" }] }, null, 2)}\n`,
    );
    const { config, isLocal } = await loadHarnessesConfig(root);
    expect(isLocal).toBe(true);
    expect(config.harnesses.map((h) => h.id)).toEqual(["only-local"]);
  });
});

describe("enabledHarnessMatrix / findHarness", () => {
  test("filters out disabled harnesses but findHarness still finds them", () => {
    const config = validConfig();
    const enabled = enabledHarnessMatrix(config);
    expect(enabled.map((h) => h.id)).toEqual(["claude-code", "raw-api"]);
    expect(findHarness(config, "disabled-harness")?.id).toBe("disabled-harness");
  });
});
