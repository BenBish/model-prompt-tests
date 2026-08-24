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
  /** Maximum simultaneous runs for this harness. Defaults to 1. */
  maxConcurrency?: number;
  /**
   * Base URL of the llama.cpp server backing this harness (started with `--metrics`), used to
   * sample `/metrics` before/after each cell for server-side decode/prefill tok/s. Only
   * meaningful for local single-tenant harnesses; omit for cloud-backed harnesses.
   */
  metricsUrl?: string;
  systemUnderTest?: Record<string, SystemUnderTestIdentity>;
}

export interface SystemUnderTestIdentity {
  underlyingModel: string;
  immutableRevision?: string;
  weightsSha256?: string;
  provider: string;
  backend: string;
  quantization?: string;
  sampling?: Record<string, unknown>;
  scaffold?: string;
  harnessVersion: string;
  cliVersion?: string;
  toolPermissions?: string[];
  contextLimit?: number;
  outputLimit?: number;
  hermetic?: boolean;
}

export interface RawApiHarnessConfig {
  id: string;
  kind: "raw-api";
  /** No model map: aliases resolve directly against bench/models.json. */
  maxContextBytes?: number;
  enabled?: boolean;
  maxConcurrency?: number;
  metricsUrl?: string;
  systemUnderTest?: Record<string, SystemUnderTestIdentity>;
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
  /**
   * Extra `codex -c key=value` overrides (e.g. custom OpenAI-compatible providers for
   * llama-swap). Values are passed as TOML-ish raw strings to codex.
   */
  configOverrides?: Record<string, string>;
  /** Pass `--ignore-user-config` for hermetic provider config (only overrides apply). */
  ignoreUserConfig?: boolean;
  /** Run with a fresh CODEX_HOME below the per-run output directory. */
  isolateCodexHome?: boolean;
  enabled?: boolean;
  maxConcurrency?: number;
  metricsUrl?: string;
  systemUnderTest?: Record<string, SystemUnderTestIdentity>;
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
  maxConcurrency?: number;
  metricsUrl?: string;
  systemUnderTest?: Record<string, SystemUnderTestIdentity>;
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

function optionalString(obj: Record<string, unknown>, key: string, context: string): string | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context}: "${key}" must be a non-empty string when present`);
  }
  return value;
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

function optionalSystemIdentities(obj: Record<string, unknown>, context: string): Record<string, SystemUnderTestIdentity> | undefined {
  const value = obj.systemUnderTest;
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${context}: "systemUnderTest" must be an object`);
  const result: Record<string, SystemUnderTestIdentity> = {};
  for (const [alias, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`${context}: "systemUnderTest.${alias}" must be an object`);
    const identity = raw as Record<string, unknown>;
    const string = (key: string, required = false) => {
      const current = identity[key];
      if (current === undefined && !required) return undefined;
      if (typeof current !== "string" || current.trim() === "") throw new Error(`${context}: "systemUnderTest.${alias}.${key}" must be a non-empty string`);
      return current;
    };
    const number = (key: string) => {
      const current = identity[key];
      if (current === undefined) return undefined;
      if (!Number.isInteger(current) || (current as number) < 1) throw new Error(`${context}: "systemUnderTest.${alias}.${key}" must be a positive integer`);
      return current as number;
    };
    const hermetic = identity.hermetic;
    if (hermetic !== undefined && typeof hermetic !== "boolean") throw new Error(`${context}: "systemUnderTest.${alias}.hermetic" must be boolean`);
    const sampling = identity.sampling;
    if (sampling !== undefined && (typeof sampling !== "object" || sampling === null || Array.isArray(sampling))) throw new Error(`${context}: "systemUnderTest.${alias}.sampling" must be an object`);
    const permissions = identity.toolPermissions;
    if (permissions !== undefined && (!Array.isArray(permissions) || permissions.some((item) => typeof item !== "string"))) throw new Error(`${context}: "systemUnderTest.${alias}.toolPermissions" must be a string array`);
    result[alias] = {
      underlyingModel: string("underlyingModel", true)!, provider: string("provider", true)!, backend: string("backend", true)!,
      harnessVersion: string("harnessVersion", true)!, immutableRevision: string("immutableRevision"), weightsSha256: string("weightsSha256"),
      quantization: string("quantization"), scaffold: string("scaffold"), cliVersion: string("cliVersion"), sampling: sampling as Record<string, unknown> | undefined,
      toolPermissions: permissions as string[] | undefined, contextLimit: number("contextLimit"), outputLimit: number("outputLimit"), hermetic: hermetic as boolean | undefined,
    };
  }
  return result;
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
    maxConcurrency: optionalPositiveInteger(obj, "maxConcurrency", context),
    metricsUrl: optionalString(obj, "metricsUrl", context),
    systemUnderTest: optionalSystemIdentities(obj, context),
  };
  // Metrics sampling reads the shared server's cumulative /metrics counters before/after each
  // cell with no cross-cell locking, so concurrent cells against the same server would sample
  // overlapping windows and silently misattribute decode/prefill tok/s between cells.
  if (common.metricsUrl !== undefined && common.maxConcurrency !== undefined && common.maxConcurrency > 1) {
    throw new Error(
      `${context}: "metricsUrl" requires "maxConcurrency" to be 1 (or omitted) — concurrent cells would ` +
        `corrupt each other's sampled throughput deltas`,
    );
  }

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
    let configOverrides: Record<string, string> | undefined;
    if (obj.configOverrides !== undefined) {
      if (typeof obj.configOverrides !== "object" || obj.configOverrides === null || Array.isArray(obj.configOverrides)) {
        throw new Error(`${context}: "configOverrides" must be an object of string values when present`);
      }
      configOverrides = {};
      for (const [k, v] of Object.entries(obj.configOverrides as Record<string, unknown>)) {
        if (typeof v !== "string" || v.trim() === "") {
          throw new Error(`${context}: "configOverrides.${k}" must be a non-empty string`);
        }
        configOverrides[k] = v;
      }
    }
    return {
      kind,
      ...common,
      models: requireStringRecord(obj, "models", context),
      sandbox: sandbox as CodexSandboxMode | undefined,
      dangerouslyBypassApprovalsAndSandbox: optionalBoolean(obj, "dangerouslyBypassApprovalsAndSandbox", context),
      oss: optionalBoolean(obj, "oss", context),
      localProvider: typeof localProvider === "string" ? localProvider : undefined,
      configOverrides,
      ignoreUserConfig: optionalBoolean(obj, "ignoreUserConfig", context),
      isolateCodexHome: optionalBoolean(obj, "isolateCodexHome", context),
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
