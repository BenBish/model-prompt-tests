import { cpSync, mkdirSync, mkdtempSync } from "node:fs";
import { platform, release, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { cleanupWorkspace, overlayHiddenTests, provisionFixtureWorkspace, runVerify, type VerifyResult } from "./workspace";
import type { FixtureSweTask, SweTask } from "./taskSpec";

export type TaskHealthStatus = "healthy" | "unhealthy" | "infrastructure-failure" | "unvalidated";
export interface TaskHealthRecord {
  taskId: string; graderVersion: string; environmentFingerprint: string;
  status: TaskHealthStatus; validatedAt: string; repetitions: number;
  runtimePrerequisites: string[]; testCount?: number; reasons: string[];
}

export function verifierEnvironmentFingerprint(): string {
  return `${platform()}-${release()}-bun-${Bun.version}`;
}

export function verifierEnvironmentName(): string {
  return `${platform()}-bun-${Bun.version.split(".").slice(0, 2).join(".")}`;
}

export function missingPrerequisites(task: SweTask): string[] {
  return (task.runtimePrerequisites ?? []).filter((declaration) =>
    declaration.split("|").every((name) => Bun.which(name) === null),
  );
}

export function assessValidationRuns(
  task: SweTask,
  oracleRuns: VerifyResult[],
  flawedRuns: VerifyResult[],
  missing: string[] = [],
  now = new Date().toISOString(),
): TaskHealthRecord {
  const reasons: string[] = [];
  if (missing.length) reasons.push(`missing prerequisites: ${missing.join(", ")}`);
  if (oracleRuns.length < 5) reasons.push(`oracle ran ${oracleRuns.length} times; at least 5 required`);
  if (oracleRuns.some((r) => !r.passed)) reasons.push("oracle did not pass 100% of repetitions");
  const counts = oracleRuns.map((r) => r.testsTotal);
  if (counts.some((n) => n === undefined)) reasons.push("oracle verifier did not report a test count");
  else if (new Set(counts).size !== 1) reasons.push(`oracle test count changed: ${counts.join(", ")}`);
  if (flawedRuns.length === 0 || flawedRuns.some((r) => r.passed)) reasons.push("an intentionally flawed solution was not rejected");
  return {
    taskId: task.id, graderVersion: task.graderVersion ?? "unversioned",
    environmentFingerprint: verifierEnvironmentFingerprint(),
    status: missing.length ? "infrastructure-failure" : reasons.length ? "unhealthy" : "healthy",
    validatedAt: now, repetitions: oracleRuns.length,
    runtimePrerequisites: task.runtimePrerequisites ?? [], testCount: counts[0], reasons,
  };
}

async function verifyFixtureSolution(task: FixtureSweTask, solution: string): Promise<VerifyResult> {
  const workspace = mkdtempSync(join(tmpdir(), `task-health-${basename(task.taskDir)}-`));
  try {
    await provisionFixtureWorkspace(task, workspace);
    const source = join(task.taskDir, solution);
    cpSync(source, join(workspace, basename(source)), { recursive: true });
    await overlayHiddenTests(task, workspace);
    return await runVerify(task, workspace);
  } finally { await cleanupWorkspace(workspace); }
}

export async function validateTaskHealth(task: SweTask, repetitions = 5): Promise<TaskHealthRecord> {
  const missing = missingPrerequisites(task);
  if (!(task.verifierEnvironments ?? []).includes(verifierEnvironmentName())) {
    missing.push(`supported verifier environment ${verifierEnvironmentName()}`);
  }
  if (missing.length) return assessValidationRuns(task, [], [], missing);
  if (task.type !== "fixture" || !task.oracleSolution) {
    return { taskId: task.id, graderVersion: task.graderVersion ?? "unversioned", environmentFingerprint: verifierEnvironmentFingerprint(), status: "unvalidated", validatedAt: new Date().toISOString(), repetitions: 0, runtimePrerequisites: task.runtimePrerequisites ?? [], reasons: ["automated health validation currently requires a fixture oracle"] };
  }
  const oracleRuns: VerifyResult[] = [];
  for (let i = 0; i < repetitions; i++) oracleRuns.push(await verifyFixtureSolution(task, task.oracleSolution));
  const flawedRuns: VerifyResult[] = [];
  for (const solution of task.flawedSolutions ?? []) flawedRuns.push(await verifyFixtureSolution(task, solution));
  return assessValidationRuns(task, oracleRuns, flawedRuns);
}

export function isComparableTask(task: SweTask, record?: TaskHealthRecord): boolean {
  return task.lifecycle === "active" && record?.status === "healthy" &&
    record.taskId === task.id && record.graderVersion === (task.graderVersion ?? "unversioned") &&
    record.environmentFingerprint === verifierEnvironmentFingerprint();
}

export function healthRecordPath(repoRoot: string, task: SweTask): string {
  const env = verifierEnvironmentFingerprint().replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${repoRoot}/bench/task-health/${task.id.replace(/[\\/]/g, "--")}--${task.graderVersion ?? "unversioned"}--${env}.json`;
}

export async function readTaskHealthRecord(repoRoot: string, task: SweTask): Promise<TaskHealthRecord | undefined> {
  const file = Bun.file(healthRecordPath(repoRoot, task));
  return (await file.exists()) ? JSON.parse(await file.text()) as TaskHealthRecord : undefined;
}

export async function writeTaskHealthRecord(repoRoot: string, task: SweTask, record: TaskHealthRecord): Promise<void> {
  mkdirSync(`${repoRoot}/bench/task-health`, { recursive: true });
  await Bun.write(healthRecordPath(repoRoot, task), `${JSON.stringify(record, null, 2)}\n`);
}
