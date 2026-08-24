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

export function validateScheduleContract(contract: ScheduleContract, now = new Date()): string[] {
  const issues: string[] = [];
  if (!contract.runId.trim()) issues.push("runId is required");
  if (contract.requiredResources.length === 0) issues.push("requiredResources must be declared");
  for (const [name, value] of Object.entries(contract.budget)) {
    if (!Number.isFinite(value) || value <= 0) issues.push(`budget.${name} must be positive`);
  }
  if (contract.executionDomain === "fedora-production-slot") {
    if (contract.lease?.owner !== "halo-maxxing" || !contract.lease.token.trim()) issues.push("Fedora execution requires a Halo-owned lease token");
    else if (new Date(contract.lease.expiresAt).getTime() <= now.getTime()) issues.push("Halo lease is expired");
  } else if (contract.lease) issues.push("generic/laptop runs must not acquire or consume a Fedora lease");
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
