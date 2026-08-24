import { createHash } from "node:crypto";

export type ExecutionDomain = "generic-ci" | "omarchy-laptop" | "fedora-production-slot";
export interface RunBudget { maxCalls: number; maxTokens: number; maxCostUsd: number; maxElapsedMs: number; maxConcurrency: number }
export interface ScheduleContract {
  schemaVersion: 1; runId: string; executionDomain: ExecutionDomain; requiredResources: string[]; budget: RunBudget;
  lease?: { owner: "halo-maxxing"; token: string; expiresAt: string };
}
export interface CellIdentity { taskId: string; modelId: string; repeatIndex: number }
export interface BudgetUsage { calls: number; tokens: number; costUsd: number; elapsedMs: number }

export function cellKey(cell: CellIdentity): string {
  return createHash("sha256").update(`${cell.taskId}\0${cell.modelId}\0${cell.repeatIndex}`).digest("hex");
}

const domains = new Set<ExecutionDomain>(["generic-ci", "omarchy-laptop", "fedora-production-slot"]);
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export function validateScheduleContract(value: unknown, now = new Date()): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["contract must be an object"];
  if (value.schemaVersion !== 1) issues.push("schemaVersion must be 1");
  if (typeof value.runId !== "string" || !value.runId.trim()) issues.push("runId is required");
  if (!Array.isArray(value.requiredResources) || value.requiredResources.length === 0 || value.requiredResources.some((item) => typeof item !== "string" || !item.trim())) issues.push("requiredResources must be non-empty strings");
  if (typeof value.executionDomain !== "string" || !domains.has(value.executionDomain as ExecutionDomain)) issues.push("executionDomain is invalid");
  const budget = value.budget;
  if (!isRecord(budget)) issues.push("budget must be an object");
  else for (const name of ["maxCalls", "maxTokens", "maxCostUsd", "maxElapsedMs", "maxConcurrency"]) {
    const amount = budget[name];
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) issues.push(`budget.${name} must be positive`);
  }
  const lease = value.lease;
  if (value.executionDomain === "fedora-production-slot") {
    if (!isRecord(lease) || lease.owner !== "halo-maxxing" || typeof lease.token !== "string" || !lease.token.trim()) issues.push("Fedora execution requires a Halo-owned lease token");
    else if (typeof lease.expiresAt !== "string" || !Number.isFinite(Date.parse(lease.expiresAt))) issues.push("Halo lease expiry is invalid");
    else if (Date.parse(lease.expiresAt) <= now.getTime()) issues.push("Halo lease is expired");
  } else if (lease !== undefined) issues.push("generic/laptop runs must not acquire or consume a Fedora lease");
  return issues;
}

export function budgetExceeded(budget: RunBudget, usage: BudgetUsage): string[] {
  return [usage.calls >= budget.maxCalls ? "model calls" : undefined, usage.tokens >= budget.maxTokens ? "tokens" : undefined,
    usage.costUsd >= budget.maxCostUsd ? "cost" : undefined, usage.elapsedMs >= budget.maxElapsedMs ? "elapsed time" : undefined]
    .filter((value): value is string => value !== undefined);
}

export function pendingCells(planned: CellIdentity[], completedKeys: Iterable<string>): CellIdentity[] {
  const complete = new Set(completedKeys); const seen = new Set<string>();
  return planned.filter((cell) => { const key = cellKey(cell); if (complete.has(key) || seen.has(key)) return false; seen.add(key); return true; });
}

export function interruptedVerdict(domain: ExecutionDomain): "invalid/inconclusive" | "inconclusive" {
  return domain === "fedora-production-slot" ? "invalid/inconclusive" : "inconclusive";
}
