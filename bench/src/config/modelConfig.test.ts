import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  type BenchModelsConfig,
  ensureLocalModelsConfig,
  loadModelsConfig,
  saveLocalModelsConfig,
  validateModelsConfig,
} from "./modelConfig";
import type { OpenAICompatibleAdapterConfig } from "../providers/types";

const tempRoots: string[] = [];

function makeTempRepo(example: unknown = validConfig()): string {
  const root = mkdtempSync(join(tmpdir(), "bench-model-config-"));
  tempRoots.push(root);
  mkdirSync(join(root, "bench"), { recursive: true });
  writeFileSync(join(root, "bench", "models.example.json"), `${JSON.stringify(example, null, 2)}\n`);
  return root;
}

function validConfig(): BenchModelsConfig {
  return {
    models: [
      {
        id: "local:test",
        kind: "openai-compatible",
        providerId: "local",
        modelName: "test-model",
        baseUrl: "http://localhost:8000/v1",
        maxConcurrent: 1,
      },
      {
        id: "judge:test",
        kind: "anthropic",
        modelName: "claude-test",
        apiKeyEnvVar: "ANTHROPIC_API_KEY",
        enabled: false,
      },
    ],
    judge: { modelId: "judge:test" },
  };
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe("model config", () => {
  test("loads the example config when local config is absent", async () => {
    const repoRoot = makeTempRepo();

    const loaded = await loadModelsConfig(repoRoot);

    expect(loaded.isLocal).toBe(false);
    expect(loaded.config.models.map((model) => model.id)).toEqual(["local:test", "judge:test"]);
    expect(loaded.config.judge.modelId).toBe("judge:test");
  });

  test("loads local config when present", async () => {
    const repoRoot = makeTempRepo();
    ensureLocalModelsConfig(repoRoot);
    const localConfig = validConfig();
    localConfig.judge.modelId = "local:test";
    saveLocalModelsConfig(repoRoot, localConfig);

    const loaded = await loadModelsConfig(repoRoot);

    expect(loaded.isLocal).toBe(true);
    expect(loaded.config.judge.modelId).toBe("local:test");
  });

  test("rejects duplicate model ids", () => {
    const config = validConfig();
    config.models.push({ ...config.models[0]! });

    expect(() => validateModelsConfig(config)).toThrow('duplicate model id "local:test"');
  });

  test("rejects a judge model id that does not exist", () => {
    const config = validConfig();
    config.judge.modelId = "missing:model";

    expect(() => validateModelsConfig(config)).toThrow(
      'judge.modelId references unknown model "missing:model"',
    );
  });

  test("rejects invalid numeric fields", () => {
    const config = validConfig();
    config.models[0]!.maxConcurrent = 0;

    expect(() => validateModelsConfig(config)).toThrow(
      'models[0]: "maxConcurrent" must be a positive integer when present',
    );
  });

  test("accepts and round-trips model pricing", async () => {
    const repoRoot = makeTempRepo();
    const config = validConfig();
    config.models[0]!.pricing = { inputPerMTok: 3, outputPerMTok: 15 };

    saveLocalModelsConfig(repoRoot, config);
    const loaded = await loadModelsConfig(repoRoot);

    expect(loaded.config.models[0]!.pricing).toEqual({ inputPerMTok: 3, outputPerMTok: 15 });
  });

  test("rejects pricing missing a required key", () => {
    const config = validConfig();
    (config.models[0]! as any).pricing = { inputPerMTok: 3 };

    expect(() => validateModelsConfig(config)).toThrow(
      'models[0]: "pricing" must specify both "inputPerMTok" and "outputPerMTok"',
    );
  });

  test("rejects negative pricing values", () => {
    const config = validConfig();
    (config.models[0]! as any).pricing = { inputPerMTok: -1, outputPerMTok: 5 };

    expect(() => validateModelsConfig(config)).toThrow(
      'models[0].pricing: "inputPerMTok" must be a non-negative number when present',
    );
  });

  test("saves a valid local config", async () => {
    const repoRoot = makeTempRepo();
    const config = validConfig();
    config.models.push({
      id: "openai:test",
      kind: "openai-compatible",
      providerId: "openai",
      modelName: "gpt-test",
      baseUrl: "https://api.openai.com/v1",
      reasoningEffort: "medium",
    });
    config.judge.modelId = "openai:test";

    saveLocalModelsConfig(repoRoot, config);
    const loaded = await loadModelsConfig(repoRoot);

    expect(loaded.config.models.some((model) => model.id === "openai:test")).toBe(true);
    const found = loaded.config.models.find(
      (model): model is OpenAICompatibleAdapterConfig => model.id === "openai:test" && model.kind === "openai-compatible",
    );
    expect(found?.reasoningEffort).toBe("medium");
    expect(loaded.config.judge.modelId).toBe("openai:test");
  });
});
