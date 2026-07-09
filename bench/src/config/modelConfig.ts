import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ModelMatrixEntry } from "../providers/types";

export interface BenchModelsConfig {
  models: ModelMatrixEntry[];
  judge: {
    modelId: string;
  };
}

export interface LoadedModelsConfig {
  config: BenchModelsConfig;
  sourcePath: string;
  isLocal: boolean;
}

export function modelsConfigPaths(repoRoot: string): { localPath: string; examplePath: string } {
  return {
    localPath: `${repoRoot}/bench/models.json`,
    examplePath: `${repoRoot}/bench/models.example.json`,
  };
}

function requireString(obj: Record<string, unknown>, key: string, context: string): string {
  const value = obj[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context}: missing required string "${key}"`);
  }
  return value;
}

function optionalString(obj: Record<string, unknown>, key: string, context: string): string | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context}: "${key}" must be a non-empty string when present`);
  }
  return value;
}

function optionalPositiveInteger(
  obj: Record<string, unknown>,
  key: string,
  context: string,
): number | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`${context}: "${key}" must be a positive integer when present`);
  }
  return value as number;
}

function optionalBoolean(obj: Record<string, unknown>, key: string, context: string): boolean | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`${context}: "${key}" must be a boolean when present`);
  }
  return value;
}

function optionalStringRecord(
  obj: Record<string, unknown>,
  key: string,
  context: string,
): Record<string, string> | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context}: "${key}" must be an object when present`);
  }
  const record = value as Record<string, unknown>;
  for (const [header, headerValue] of Object.entries(record)) {
    if (typeof headerValue !== "string") {
      throw new Error(`${context}: "${key}.${header}" must be a string`);
    }
  }
  return record as Record<string, string>;
}

function normalizeModel(raw: unknown, index: number): ModelMatrixEntry {
  const context = `models[${index}]`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${context}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const kind = requireString(obj, "kind", context);
  const common = {
    id: requireString(obj, "id", context),
    modelName: requireString(obj, "modelName", context),
    maxTokens: optionalPositiveInteger(obj, "maxTokens", context),
    maxConcurrent: optionalPositiveInteger(obj, "maxConcurrent", context),
    timeoutMs: optionalPositiveInteger(obj, "timeoutMs", context),
    enabled: optionalBoolean(obj, "enabled", context),
  };

  if (kind === "anthropic") {
    return {
      kind,
      ...common,
      apiKeyEnvVar: requireString(obj, "apiKeyEnvVar", context),
      baseUrl: optionalString(obj, "baseUrl", context),
      anthropicVersion: optionalString(obj, "anthropicVersion", context),
    };
  }

  if (kind === "openai-compatible") {
    return {
      kind,
      ...common,
      providerId: requireString(obj, "providerId", context),
      baseUrl: requireString(obj, "baseUrl", context),
      apiKeyEnvVar: optionalString(obj, "apiKeyEnvVar", context),
      extraHeaders: optionalStringRecord(obj, "extraHeaders", context),
    };
  }

  throw new Error(`${context}: unsupported kind "${kind}"`);
}

export function validateModelsConfig(raw: unknown): BenchModelsConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("models config must be an object");
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.models) || obj.models.length === 0) {
    throw new Error('models config must contain a non-empty "models" array');
  }
  const models = obj.models.map(normalizeModel);
  const ids = new Set<string>();
  for (const model of models) {
    if (ids.has(model.id)) {
      throw new Error(`duplicate model id "${model.id}"`);
    }
    ids.add(model.id);
  }

  if (typeof obj.judge !== "object" || obj.judge === null || Array.isArray(obj.judge)) {
    throw new Error('models config must contain a "judge" object');
  }
  const judge = obj.judge as Record<string, unknown>;
  const modelId = requireString(judge, "modelId", "judge");
  if (!ids.has(modelId)) {
    throw new Error(`judge.modelId references unknown model "${modelId}"`);
  }

  return { models, judge: { modelId } };
}

export async function loadModelsConfig(repoRoot: string): Promise<LoadedModelsConfig> {
  const { localPath, examplePath } = modelsConfigPaths(repoRoot);
  const sourcePath = existsSync(localPath) ? localPath : examplePath;
  const text = await Bun.file(sourcePath).text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${sourcePath}: invalid JSON: ${message}`);
  }
  try {
    return {
      config: validateModelsConfig(raw),
      sourcePath,
      isLocal: sourcePath === localPath,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${sourcePath}: ${message}`);
  }
}

export function ensureLocalModelsConfig(repoRoot: string): string {
  const { localPath, examplePath } = modelsConfigPaths(repoRoot);
  if (!existsSync(localPath)) {
    mkdirSync(dirname(localPath), { recursive: true });
    copyFileSync(examplePath, localPath);
  }
  return localPath;
}

export function saveLocalModelsConfig(repoRoot: string, config: BenchModelsConfig): string {
  validateModelsConfig(config);
  const { localPath } = modelsConfigPaths(repoRoot);
  mkdirSync(dirname(localPath), { recursive: true });
  writeFileSync(localPath, `${JSON.stringify(config, null, 2)}\n`);
  return localPath;
}

export function enabledModelMatrix(config: BenchModelsConfig): ModelMatrixEntry[] {
  return config.models.filter((model) => model.enabled !== false);
}

export function findModel(config: BenchModelsConfig, modelId: string): ModelMatrixEntry | undefined {
  return config.models.find((model) => model.id === modelId);
}
