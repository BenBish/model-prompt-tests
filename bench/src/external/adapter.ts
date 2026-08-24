import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { canonicalJson, sha256 } from "../experiment/manifest";
import { runCommand } from "../swe/harness/runCommand";
import type { ExternalAdapter, ExternalAdapterConfig, ExternalEcosystem, ExternalNativeResult, ExternalPlan, ExternalRunResult, ExternalTaskDefinition, NormalizedOutcome } from "./types";

export class MissingExternalDependencyError extends Error {
  constructor(readonly ecosystem: ExternalEcosystem, readonly executable: string) {
    super(`${ecosystem} adapter dependency is missing: ${executable}`);
    this.name = "MissingExternalDependencyError";
  }
}

export class ExternalDependencyVersionError extends Error {
  constructor(readonly ecosystem: ExternalEcosystem, readonly expected: string, readonly observed: string) {
    super(`${ecosystem} adapter runner version mismatch: expected ${expected}, observed ${observed || "unknown"}`);
    this.name = "ExternalDependencyVersionError";
  }
}

function interpolate(values: string[], replacements: Record<string, string>): string[] {
  return values.map((value) => value.replace(/\{(model|task|dataset|output|result)\}/g, (_, key: string) => replacements[key]!));
}

function normalize(ecosystem: ExternalEcosystem, native: ExternalNativeResult, exitCode: number): NormalizedOutcome {
  if (exitCode !== 0) return "error";
  if (native.parseError !== undefined) return "error";
  if (native.passed === true || native.status === "passed" || native.status === "success") return "passed";
  if (native.passed === false || native.status === "failed" || native.status === "failure") return "failed";
  if (native.status === "partial") return "partial";
  if (ecosystem === "harbor") {
    const reward = typeof native.reward === "number" ? native.reward : undefined;
    if (reward !== undefined) return reward >= 1 ? "passed" : "failed";
  }
  // Frameworks such as lm-eval report continuous native scores rather than a binary pass.
  // A successful runner invocation is therefore comparable only as "partial"; native metrics remain authoritative.
  return "partial";
}

async function matchingFiles(outputDir: string, patterns: string[]): Promise<string[]> {
  const matches = new Set<string>();
  for (const pattern of patterns) {
    const glob = new Bun.Glob(pattern);
    for await (const path of glob.scan({ cwd: outputDir, onlyFiles: true })) matches.add(path);
  }
  return [...matches].sort();
}

export class CommandExternalAdapter implements ExternalAdapter {
  constructor(readonly ecosystem: ExternalEcosystem, private readonly executable: string, private readonly versionCommand: string[], private readonly tasks: ExternalTaskDefinition[], private readonly cwd: string) {}

  discover(): ExternalTaskDefinition[] { return this.tasks.map((task) => structuredClone(task)); }

  async checkDependency(): Promise<{ executable: string; available: boolean; observedVersion?: string }> {
    const candidate = isAbsolute(this.executable) ? (existsSync(this.executable) ? this.executable : null) : Bun.which(this.executable);
    if (candidate === null) return { executable: this.executable, available: false };
    const probe = await runCommand({ cmd: this.versionCommand, cwd: this.cwd, env: { ...process.env } as Record<string, string>, timeoutMs: 10_000 });
    return { executable: this.executable, available: probe.exitCode === 0, observedVersion: `${probe.stdout}\n${probe.stderr}`.trim() };
  }

  resolve(taskId: string): ExternalTaskDefinition {
    const task = this.tasks.find((entry) => entry.id === taskId);
    if (!task) throw new Error(`unknown ${this.ecosystem} task: ${taskId}`);
    if (!task.datasetVersion.trim() || /^(latest|main|master)$/i.test(task.datasetVersion)) throw new Error(`task ${task.id} must pin an immutable dataset version`);
    if (!task.runnerVersion.trim() || /^(latest|main|master)$/i.test(task.runnerVersion)) throw new Error(`task ${task.id} must pin an immutable runner version`);
    if (this.ecosystem === "harbor" && (!task.isolation?.agentEnvironment || !task.isolation.verifierEnvironment || !task.isolation.verifierLocked)) throw new Error(`Harbor task ${task.id} requires isolated agent and locked verifier environments`);
    return structuredClone(task);
  }

  plan(taskId: string, model: string): ExternalPlan {
    const task = this.resolve(taskId);
    const configurationHash = sha256(canonicalJson({ ecosystem: this.ecosystem, task, model }));
    const output = "{output}";
    const command = interpolate(task.command, { model, task: task.id, dataset: task.datasetVersion, output, result: "{result}" });
    return { schemaVersion: 1, source: "external", ecosystem: this.ecosystem, task, model, command, configurationHash, cacheKey: sha256(canonicalJson({ ecosystem: this.ecosystem, task: task.id, datasetVersion: task.datasetVersion, runnerVersion: task.runnerVersion, model, configurationHash })) };
  }

  async execute(plan: ExternalPlan, outputDir: string): Promise<ExternalRunResult> {
    const dependency = await this.checkDependency();
    if (!dependency.available) throw new MissingExternalDependencyError(this.ecosystem, dependency.executable);
    const expectedVersion = plan.task.runnerVersion.slice(plan.task.runnerVersion.lastIndexOf("@") + 1);
    if (!dependency.observedVersion?.includes(expectedVersion)) throw new ExternalDependencyVersionError(this.ecosystem, expectedVersion, dependency.observedVersion ?? "");
    await mkdir(outputDir, { recursive: true });
    const command = interpolate(plan.command, { model: plan.model, task: plan.task.id, dataset: plan.task.datasetVersion, output: outputDir, result: join(outputDir, "results.json") });
    const result = await runCommand({ cmd: command, cwd: this.cwd, env: { ...process.env } as Record<string, string>, timeoutMs: 600_000 });
    const resultFiles = await matchingFiles(outputDir, [plan.task.resultPattern]);
    const resultPath = resultFiles[0] ? join(outputDir, resultFiles[0]) : join(outputDir, plan.task.resultPattern);
    let native: ExternalNativeResult;
    try { native = JSON.parse(await readFile(resultPath, "utf8")) as ExternalNativeResult; }
    catch (error) { native = { status: "error", parseError: error instanceof Error ? error.message : String(error) }; }
    const artifacts = await matchingFiles(outputDir, [plan.task.resultPattern, ...(plan.task.artifactPatterns ?? [])]);
    const envelope: ExternalRunResult = { schemaVersion: 1, source: "external", ecosystem: this.ecosystem, taskIdentity: { id: plan.task.id, datasetVersion: plan.task.datasetVersion }, runnerVersion: plan.task.runnerVersion, model: plan.model, configurationHash: plan.configurationHash, cacheKey: plan.cacheKey, outcome: normalize(this.ecosystem, native, result.exitCode), native, provenance: { command, citation: plan.task.citation, license: plan.task.license, observedRunnerVersion: dependency.observedVersion!, isolation: plan.task.isolation }, logs: { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, latencyMs: result.latencyMs }, artifacts };
    const envelopePath = join(outputDir, "external-result.json");
    await mkdir(dirname(envelopePath), { recursive: true });
    await writeFile(envelopePath, `${JSON.stringify(envelope, null, 2)}\n`);
    return envelope;
  }
}

export async function loadExternalAdapters(configPath: string, repoRoot: string): Promise<Record<ExternalEcosystem, CommandExternalAdapter>> {
  const config = validateConfig(JSON.parse(await readFile(configPath, "utf8")));
  return Object.fromEntries(Object.entries(config.ecosystems).map(([ecosystem, entry]) => [ecosystem, new CommandExternalAdapter(ecosystem as ExternalEcosystem, entry.executable, entry.versionCommand, entry.tasks, repoRoot)])) as Record<ExternalEcosystem, CommandExternalAdapter>;
}

function strings(value: unknown): value is string[] { return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.length > 0); }
function validateConfig(value: unknown): ExternalAdapterConfig {
  if (!value || typeof value !== "object") throw new Error("external adapter config must be an object");
  const config = value as Partial<ExternalAdapterConfig>;
  if (config.schemaVersion !== 1 || !config.ecosystems || typeof config.ecosystems !== "object") throw new Error("external adapter config requires schemaVersion 1 and ecosystems");
  const allowed = new Set<ExternalEcosystem>(["inspect", "harbor", "lm-eval"]);
  for (const [name, raw] of Object.entries(config.ecosystems)) {
    if (!allowed.has(name as ExternalEcosystem)) throw new Error(`unsupported external ecosystem: ${name}`);
    const entry = raw as { executable?: unknown; versionCommand?: unknown; tasks?: unknown };
    if (typeof entry.executable !== "string" || !strings(entry.versionCommand) || !Array.isArray(entry.tasks)) throw new Error(`invalid ${name} adapter definition`);
    for (const rawTask of entry.tasks) {
      const task = rawTask as Partial<ExternalTaskDefinition>;
      if (typeof task.id !== "string" || typeof task.datasetVersion !== "string" || typeof task.runnerVersion !== "string" || !strings(task.command) || typeof task.resultPattern !== "string" || typeof task.citation !== "string" || typeof task.license !== "string" || (task.artifactPatterns !== undefined && !strings(task.artifactPatterns))) throw new Error(`invalid ${name} task definition`);
      if (name === "harbor" && (!task.isolation?.agentEnvironment || !task.isolation.verifierEnvironment || task.isolation.verifierLocked !== true)) throw new Error(`Harbor task ${task.id} requires isolated agent and locked verifier environments`);
    }
  }
  for (const name of allowed) if (!(name in config.ecosystems)) throw new Error(`missing external ecosystem: ${name}`);
  return config as ExternalAdapterConfig;
}
