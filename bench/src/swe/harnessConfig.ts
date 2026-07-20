import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface ClaudeCodeHarnessConfig {
  id: string;
  kind: "claude-code";
  /** Alias -> harness-native model name, e.g. { sonnet: "claude-sonnet-5" }. */
  models: Record<string, string>;
  maxTurns?: number;
  /**
   * Passes `--bare` for hermetic runs (skips hooks/plugins/CLAUDE.md discovery). Requires
   * ANTHROPIC_API_KEY: `--bare` also skips normal OAuth/subscription session-credential
   * discovery, confirmed empirically. Defaults to false so it works with an interactive
   * `claude login` session out of the box.
   */
  bare?: boolean;
  enabled?: boolean;
}

export interface RawApiHarnessConfig {
  id: string;
  kind: "raw-api";
  /** No model map: aliases resolve directly against bench/models.json. */
  maxContextBytes?: number;
  enabled?: boolean;
}

export type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access";

export interface CodexHarnessConfig {
  id: string;
  kind: "codex";
  /** Alias -> harness-native model name. */
  models: Record<string, string>;
  /** Default: workspace-write. Config may escalate via dangerouslyBypassApprovalsAndSandbox. */
  sandbox?: CodexSandboxMode;
  /** Skip all confirmations and sandboxing (extremely dangerous; for externally sandboxed envs). */
  dangerouslyBypassApprovalsAndSandbox?: boolean;
  /** Use open-source / local provider path (`--oss`). */
  oss?: boolean;
  /** With oss: lmstudio | ollama. */
  localProvider?: string;
  enabled?: boolean;
}

export type GenericCliPromptVia = "stdin" | "arg" | "file";

export interface GenericCliHarnessConfig {
  id: string;
  kind: "generic-cli";
  /**
   * Argv template. Placeholders: `{model}`, `{workdir}`, `{promptFile}`.
   * First element is the binary (unless `binary` is set).
   */
  command: string[];
  models: Record<string, string>;
  /** How to feed the task prompt. Default: stdin. */
  promptVia?: GenericCliPromptVia;
  /**
   * Dotted path into a top-level JSON object (or the last JSONL event) for the final message,
   * e.g. `result` or `message.content`. When missing or unparseable, whole stdout is used.
   */
  resultPath?: string;
  /** Binary name for availability checks (default: first command element). */
  binary?: string;
  /** Extra env keys to pass through (e.g. API keys). */
  extraEnvKeys?: string[];
  /** Env prefixes to strip (e.g. CLAUDE_CODE_). */
  stripPrefixes?: string[];
  enabled?: boolean;
}

export type HarnessMatrixEntry =
  | ClaudeCodeHarnessConfig
  | RawApiHarnessConfig
  | CodexHarnessConfig
  | GenericCliHarnessConfig;

export interface BenchHarnessesConfig {
  harnesses: HarnessMatrixEntry[];
}

export interface LoadedHarnessesConfig {
  config: BenchHarnessesConfig;
  sourcePath: string;
  isLocal: boolean;
}

export function harnessesConfigPaths(repoRoot: string): { localPath: string; examplePath: string } {
  return {
    localPath: `${repoRoot}/bench/harnesses.json`,
    examplePath: `${repoRoot}/bench/harnesses.example.json`,
  };
}

function requireString(obj: Record<string, unknown>, key: string, context: string): string {
  const value = obj[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context}: missing required string "${key}"`);
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

function requireStringRecord(obj: Record<string, unknown>, key: string, context: string): Record<string, string> {
  const value = obj[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context}: missing required object "${key}"`);
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length === 0) {
    throw new Error(`${context}: "${key}" must have at least one entry`);
  }
  for (const [alias, modelName] of Object.entries(record)) {
    if (typeof modelName !== "string" || modelName.trim() === "") {
      throw new Error(`${context}: "${key}.${alias}" must be a non-empty string`);
    }
  }
  return record as Record<string, string>;
}

function requireStringArray(obj: Record<string, unknown>, key: string, context: string): string[] {
  const value = obj[key];
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context}: missing required non-empty string array "${key}"`);
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== "string" || (value[i] as string).trim() === "") {
      throw new Error(`${context}: "${key}[${i}]" must be a non-empty string`);
    }
  }
  return value as string[];
}

function optionalStringArray(obj: Record<string, unknown>, key: string, context: string): string[] | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`${context}: "${key}" must be an array of strings when present`);
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== "string" || (value[i] as string).trim() === "") {
      throw new Error(`${context}: "${key}[${i}]" must be a non-empty string`);
    }
  }
  return value as string[];
}

const CODEX_SANDBOX_MODES = new Set(["read-only", "workspace-write", "danger-full-access"]);
const PROMPT_VIA_MODES = new Set(["stdin", "arg", "file"]);

function normalizeHarness(raw: unknown, index: number): HarnessMatrixEntry {
  const context = `harnesses[${index}]`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${context}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const kind = requireString(obj, "kind", context);
  const common = {
    id: requireString(obj, "id", context),
    enabled: optionalBoolean(obj, "enabled", context),
  };

  if (kind === "claude-code") {
    return {
      kind,
      ...common,
      models: requireStringRecord(obj, "models", context),
      maxTurns: optionalPositiveInteger(obj, "maxTurns", context),
      bare: optionalBoolean(obj, "bare", context),
    };
  }

  if (kind === "raw-api") {
    return {
      kind,
      ...common,
      maxContextBytes: optionalPositiveInteger(obj, "maxContextBytes", context),
    };
  }

  if (kind === "codex") {
    const sandbox = obj.sandbox;
    if (sandbox !== undefined) {
      if (typeof sandbox !== "string" || !CODEX_SANDBOX_MODES.has(sandbox)) {
        throw new Error(
          `${context}: "sandbox" must be one of ${[...CODEX_SANDBOX_MODES].join(", ")} when present`,
        );
      }
    }
    const localProvider = obj.localProvider;
    if (localProvider !== undefined && (typeof localProvider !== "string" || localProvider.trim() === "")) {
      throw new Error(`${context}: "localProvider" must be a non-empty string when present`);
    }
    return {
      kind,
      ...common,
      models: requireStringRecord(obj, "models", context),
      sandbox: sandbox as CodexSandboxMode | undefined,
      dangerouslyBypassApprovalsAndSandbox: optionalBoolean(obj, "dangerouslyBypassApprovalsAndSandbox", context),
      oss: optionalBoolean(obj, "oss", context),
      localProvider: typeof localProvider === "string" ? localProvider : undefined,
    };
  }

  if (kind === "generic-cli") {
    const promptVia = obj.promptVia;
    if (promptVia !== undefined) {
      if (typeof promptVia !== "string" || !PROMPT_VIA_MODES.has(promptVia)) {
        throw new Error(`${context}: "promptVia" must be one of stdin, arg, file when present`);
      }
    }
    const resultPath = obj.resultPath;
    if (resultPath !== undefined && (typeof resultPath !== "string" || resultPath.trim() === "")) {
      throw new Error(`${context}: "resultPath" must be a non-empty string when present`);
    }
    const binary = obj.binary;
    if (binary !== undefined && (typeof binary !== "string" || binary.trim() === "")) {
      throw new Error(`${context}: "binary" must be a non-empty string when present`);
    }
    return {
      kind,
      ...common,
      command: requireStringArray(obj, "command", context),
      models: requireStringRecord(obj, "models", context),
      promptVia: promptVia as GenericCliPromptVia | undefined,
      resultPath: typeof resultPath === "string" ? resultPath : undefined,
      binary: typeof binary === "string" ? binary : undefined,
      extraEnvKeys: optionalStringArray(obj, "extraEnvKeys", context),
      stripPrefixes: optionalStringArray(obj, "stripPrefixes", context),
    };
  }

  throw new Error(`${context}: unsupported kind "${kind}"`);
}

export function validateHarnessesConfig(raw: unknown): BenchHarnessesConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("harnesses config must be an object");
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.harnesses) || obj.harnesses.length === 0) {
    throw new Error('harnesses config must contain a non-empty "harnesses" array');
  }
  const harnesses = obj.harnesses.map(normalizeHarness);
  const ids = new Set<string>();
  for (const harness of harnesses) {
    if (ids.has(harness.id)) {
      throw new Error(`duplicate harness id "${harness.id}"`);
    }
    ids.add(harness.id);
  }

  return { harnesses };
}

export async function loadHarnessesConfig(repoRoot: string): Promise<LoadedHarnessesConfig> {
  const { localPath, examplePath } = harnessesConfigPaths(repoRoot);
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
      config: validateHarnessesConfig(raw),
      sourcePath,
      isLocal: sourcePath === localPath,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${sourcePath}: ${message}`);
  }
}

export function ensureLocalHarnessesConfig(repoRoot: string): string {
  const { localPath, examplePath } = harnessesConfigPaths(repoRoot);
  if (!existsSync(localPath)) {
    mkdirSync(dirname(localPath), { recursive: true });
    copyFileSync(examplePath, localPath);
  }
  return localPath;
}

export function enabledHarnessMatrix(config: BenchHarnessesConfig): HarnessMatrixEntry[] {
  return config.harnesses.filter((harness) => harness.enabled !== false);
}

export function findHarness(config: BenchHarnessesConfig, harnessId: string): HarnessMatrixEntry | undefined {
  return config.harnesses.find((harness) => harness.id === harnessId);
}
