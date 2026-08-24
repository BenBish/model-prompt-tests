export const EXTERNAL_ADAPTER_SCHEMA_VERSION = 1 as const;

export type ExternalEcosystem = "inspect" | "harbor" | "lm-eval";
export type NormalizedOutcome = "passed" | "failed" | "error" | "partial";

export interface ExternalTaskDefinition {
  id: string;
  datasetVersion: string;
  runnerVersion: string;
  command: string[];
  resultFile: string;
  artifacts?: string[];
  citation: string;
  license: string;
  config?: Record<string, unknown>;
  isolation?: { agentEnvironment: string; verifierEnvironment: string; verifierLocked: boolean };
}

export interface ExternalAdapterConfig {
  schemaVersion: 1;
  ecosystems: Record<ExternalEcosystem, { executable: string; tasks: ExternalTaskDefinition[] }>;
}

export interface ExternalPlan {
  schemaVersion: 1;
  source: "external";
  ecosystem: ExternalEcosystem;
  task: ExternalTaskDefinition;
  model: string;
  command: string[];
  configurationHash: string;
  cacheKey: string;
}

export interface ExternalNativeResult {
  status?: string;
  passed?: boolean;
  metrics?: Record<string, number | string | boolean | null>;
  transcript?: unknown;
  [key: string]: unknown;
}

export interface ExternalRunResult {
  schemaVersion: 1;
  source: "external";
  ecosystem: ExternalEcosystem;
  taskIdentity: { id: string; datasetVersion: string };
  runnerVersion: string;
  model: string;
  configurationHash: string;
  cacheKey: string;
  outcome: NormalizedOutcome;
  native: ExternalNativeResult;
  provenance: { command: string[]; citation: string; license: string; isolation?: ExternalTaskDefinition["isolation"] };
  logs: { stdout: string; stderr: string; exitCode: number; latencyMs: number };
  artifacts: string[];
}

export interface ExternalAdapter {
  readonly ecosystem: ExternalEcosystem;
  discover(): ExternalTaskDefinition[];
  checkDependency(): Promise<{ executable: string; available: boolean }>;
  resolve(taskId: string): ExternalTaskDefinition;
  plan(taskId: string, model: string): ExternalPlan;
  execute(plan: ExternalPlan, outputDir: string): Promise<ExternalRunResult>;
}
