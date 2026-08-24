import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { canonicalJson, sha256 } from "../experiment/manifest";
import { runCommand } from "../swe/harness/runCommand";
import type { ExternalAdapter, ExternalAdapterConfig, ExternalEcosystem, ExternalNativeResult, ExternalPlan, ExternalRunResult, ExternalTaskDefinition, NormalizedOutcome } from "./types";

export class MissingExternalDependencyError extends Error {
  constructor(readonly ecosystem: ExternalEcosystem, readonly executable: string) {
    super(`${ecosystem} adapter dependency is missing: ${executable}`);
    this.name = "MissingExternalDependencyError";
  }
}

function interpolate(values: string[], replacements: Record<string, string>): string[] {
  return values.map((value) => value.replace(/\{(model|task|dataset|output)\}/g, (_, key: string) => replacements[key]!));
}

function normalize(native: ExternalNativeResult, exitCode: number): NormalizedOutcome {
  if (exitCode !== 0) return "error";
  if (native.passed === true || native.status === "passed" || native.status === "success") return "passed";
  if (native.passed === false || native.status === "failed" || native.status === "failure") return "failed";
  if (native.status === "partial") return "partial";
  return "error";
}

async function existingArtifacts(outputDir: string, patterns: string[]): Promise<string[]> {
  const files = await readdir(outputDir, { recursive: true }).catch(() => [] as string[]);
  const wanted = new Set(patterns.map((path) => path.replace(/^\.\//, "")));
  return files.filter((path) => wanted.has(path) || wanted.has(basename(path))).sort();
}

export class CommandExternalAdapter implements ExternalAdapter {
  constructor(readonly ecosystem: ExternalEcosystem, private readonly executable: string, private readonly tasks: ExternalTaskDefinition[], private readonly cwd: string) {}

  discover(): ExternalTaskDefinition[] { return this.tasks.map((task) => structuredClone(task)); }

  async checkDependency(): Promise<{ executable: string; available: boolean }> {
    const candidate = isAbsolute(this.executable) ? (existsSync(this.executable) ? this.executable : null) : Bun.which(this.executable);
    return { executable: this.executable, available: candidate !== null };
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
    const command = interpolate(task.command, { model, task: task.id, dataset: task.datasetVersion, output });
    return { schemaVersion: 1, source: "external", ecosystem: this.ecosystem, task, model, command, configurationHash, cacheKey: sha256(canonicalJson({ ecosystem: this.ecosystem, task: task.id, datasetVersion: task.datasetVersion, runnerVersion: task.runnerVersion, model, configurationHash })) };
  }

  async execute(plan: ExternalPlan, outputDir: string): Promise<ExternalRunResult> {
    const dependency = await this.checkDependency();
    if (!dependency.available) throw new MissingExternalDependencyError(this.ecosystem, dependency.executable);
    await mkdir(outputDir, { recursive: true });
    const command = interpolate(plan.command, { model: plan.model, task: plan.task.id, dataset: plan.task.datasetVersion, output: outputDir });
    const result = await runCommand({ cmd: command, cwd: this.cwd, env: { ...process.env } as Record<string, string>, timeoutMs: 600_000 });
    const resultPath = isAbsolute(plan.task.resultFile) ? plan.task.resultFile : join(outputDir, plan.task.resultFile);
    let native: ExternalNativeResult;
    try { native = JSON.parse(await readFile(resultPath, "utf8")) as ExternalNativeResult; }
    catch (error) { native = { status: "error", parseError: error instanceof Error ? error.message : String(error) }; }
    const artifacts = await existingArtifacts(outputDir, [plan.task.resultFile, ...(plan.task.artifacts ?? [])]);
    const envelope: ExternalRunResult = { schemaVersion: 1, source: "external", ecosystem: this.ecosystem, taskIdentity: { id: plan.task.id, datasetVersion: plan.task.datasetVersion }, runnerVersion: plan.task.runnerVersion, model: plan.model, configurationHash: plan.configurationHash, cacheKey: plan.cacheKey, outcome: normalize(native, result.exitCode), native, provenance: { command, citation: plan.task.citation, license: plan.task.license, isolation: plan.task.isolation }, logs: { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, latencyMs: result.latencyMs }, artifacts };
    const envelopePath = join(outputDir, "external-result.json");
    await mkdir(dirname(envelopePath), { recursive: true });
    await writeFile(envelopePath, `${JSON.stringify(envelope, null, 2)}\n`);
    return envelope;
  }
}

export async function loadExternalAdapters(configPath: string, repoRoot: string): Promise<Record<ExternalEcosystem, CommandExternalAdapter>> {
  const config = JSON.parse(await readFile(configPath, "utf8")) as ExternalAdapterConfig;
  if (config.schemaVersion !== 1) throw new Error(`unsupported external adapter config schema: ${config.schemaVersion}`);
  return Object.fromEntries(Object.entries(config.ecosystems).map(([ecosystem, entry]) => [ecosystem, new CommandExternalAdapter(ecosystem as ExternalEcosystem, entry.executable, entry.tasks, repoRoot)])) as Record<ExternalEcosystem, CommandExternalAdapter>;
}
