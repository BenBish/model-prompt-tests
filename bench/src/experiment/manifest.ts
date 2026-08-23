import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpus, homedir, hostname, platform, release, totalmem } from "node:os";

export const EXPERIMENT_SCHEMA_VERSION = 1 as const;
export interface ContentIdentity { id: string; sha256: string }
export interface ModelIdentity { id: string; provider: string; model: string; immutableRevision?: string; weightsSha256?: string; backend?: string; quantization?: string; generation?: Record<string, unknown> }
export interface EnvironmentFingerprint { schemaVersion: 1; executionDomain: string; os: { platform: string; distro?: string; kernel: string }; cpu: string; memoryBytes: number; accelerator?: string; runtime?: string; driver?: string; buildFlags?: string[]; powerProfile?: string; thermalState?: string; topology?: string; concurrency: number; productionServices: "stopped" | "co-resident" | "unknown" }
export interface ExperimentManifest { schemaVersion: 1; createdAt: string; suite: { id: string; version: string }; repository: { sha: string; dirty: boolean }; tasks: ContentIdentity[]; models: ModelIdentity[]; judges: Array<ContentIdentity & { modelId: string }>; harness: { id: string; version: string; config: Record<string, unknown> }; prompts: { system?: string; developer?: string }; limits: Record<string, number | undefined>; toolPermissions: string[]; plannedRepeats: number; exclusions: string[]; environment: EnvironmentFingerprint; externalEvaluationId?: string }

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, normalized(v)]));
  return value;
}
export function canonicalJson(value: unknown): string { return JSON.stringify(normalized(value)); }
export function sha256(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
export function manifestId(manifest: ExperimentManifest): string { return `exp_${sha256(canonicalJson(manifest))}`; }
function readOsRelease(): string | undefined { try { return execFileSync("sh", ["-c", ". /etc/os-release; printf %s \"${PRETTY_NAME:-$ID}\""]).toString() || undefined; } catch { return undefined; } }
export function fingerprintEnvironment(overrides: Partial<EnvironmentFingerprint> & Pick<EnvironmentFingerprint, "executionDomain" | "concurrency">): EnvironmentFingerprint {
  const env = process.env;
  return { schemaVersion: 1, executionDomain: overrides.executionDomain, os: overrides.os ?? { platform: platform(), distro: readOsRelease(), kernel: release() }, cpu: overrides.cpu ?? cpus()[0]?.model ?? "unknown", memoryBytes: overrides.memoryBytes ?? totalmem(), concurrency: overrides.concurrency, productionServices: overrides.productionServices ?? (env.BENCH_PRODUCTION_SERVICES as EnvironmentFingerprint["productionServices"] | undefined) ?? "unknown", accelerator: overrides.accelerator ?? env.BENCH_ACCELERATOR, runtime: overrides.runtime ?? env.BENCH_ACCELERATOR_RUNTIME, driver: overrides.driver ?? env.BENCH_ACCELERATOR_DRIVER, buildFlags: overrides.buildFlags ?? env.BENCH_BUILD_FLAGS?.split(",").map((v) => v.trim()).filter(Boolean).sort(), powerProfile: overrides.powerProfile ?? env.BENCH_POWER_PROFILE, thermalState: overrides.thermalState ?? env.BENCH_THERMAL_STATE, topology: overrides.topology ?? env.BENCH_SERVER_TOPOLOGY };
}
export function repositoryState(repoRoot: string): { sha: string; dirty: boolean } { return { sha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim(), dirty: execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: repoRoot, encoding: "utf8" }).trim().length > 0 }; }
export function publicationIssues(manifest: ExperimentManifest): string[] { return manifest.models.flatMap((model) => ((/(^|:)(lab-candidate|local)(:|$)/i.test(model.id) || model.provider === "local") && !model.weightsSha256 && !model.immutableRevision) ? [`model ${model.id} lacks weightsSha256 or immutableRevision`] : []); }
export function redactManifest(manifest: ExperimentManifest): ExperimentManifest { return JSON.parse(canonicalJson(manifest).replaceAll(homedir(), "<home>").replaceAll(hostname(), "<host>")); }
