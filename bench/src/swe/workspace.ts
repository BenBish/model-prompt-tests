import { appendFileSync, mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import { buildHarnessEnv } from "./harness/env";
import { runCommand } from "./harness/runCommand";
import type { FixtureSweTask } from "./taskSpec";

const DEFAULT_SETUP_TIMEOUT_MS = 120_000;
const MAX_VERIFY_OUTPUT_BYTES = 64 * 1024;

/** Minimal fields needed to run a verify command (fixture or external). */
export interface VerifiableTask {
  verify: string;
  verifyTimeoutMs: number;
  envPassthrough: string[];
}

function gitEnv(): Record<string, string> {
  return {
    ...buildHarnessEnv(),
    GIT_AUTHOR_NAME: "bench",
    GIT_AUTHOR_EMAIL: "bench@localhost",
    GIT_COMMITTER_NAME: "bench",
    GIT_COMMITTER_EMAIL: "bench@localhost",
  };
}

function slugify(value: string): string {
  return value.replace(/[\\/]/g, "-").replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function workspaceDirFor(
  workspacesRoot: string,
  runBatchId: string,
  taskId: string,
  harnessId: string,
  modelAlias: string,
  repeatIndex: number,
): string {
  const cellDir = `${slugify(taskId)}--${slugify(harnessId)}--${slugify(modelAlias)}--r${repeatIndex}`;
  return `${workspacesRoot}/${slugify(runBatchId)}/${cellDir}`;
}

export interface ProvisionedWorkspace {
  dir: string;
  baselineSha: string;
  postSetupSha: string;
  setupOutput?: { stdout: string; stderr: string; exitCode: number; timedOut: boolean };
}

async function hasUncommittedChanges(dir: string): Promise<boolean> {
  const status = await runCommand({
    cmd: ["git", "status", "--porcelain"],
    cwd: dir,
    env: gitEnv(),
    timeoutMs: 10_000,
  });
  return status.stdout.trim().length > 0;
}

async function currentHeadSha(dir: string): Promise<string> {
  const result = await runCommand({ cmd: ["git", "rev-parse", "HEAD"], cwd: dir, env: gitEnv(), timeoutMs: 10_000 });
  return result.stdout.trim();
}

/**
 * Copies a fixture task's visible project into a fresh git-tracked workspace, commits a baseline,
 * runs the task's `setup` command if any, and commits again — that second commit is the diff
 * baseline the agent's changes get measured against, so generated files from setup (lockfiles,
 * node_modules if not ignored, etc.) don't show up as part of the agent's "diff".
 */
export async function provisionFixtureWorkspace(
  task: FixtureSweTask,
  workspaceDir: string,
): Promise<ProvisionedWorkspace> {
  mkdirSync(workspaceDir, { recursive: true });
  const env = gitEnv();

  const copyResult = await runCommand({
    cmd: ["cp", "-R", `${task.projectDir}/.`, `${workspaceDir}/`],
    cwd: workspaceDir,
    env,
    timeoutMs: 30_000,
  });
  if (copyResult.exitCode !== 0) {
    throw new Error(`failed to copy fixture project from ${task.projectDir}: ${copyResult.stderr}`);
  }

  await runCommand({ cmd: ["git", "init", "-q", "-b", "main"], cwd: workspaceDir, env, timeoutMs: 10_000 });

  if (task.ignorePaths.length > 0) {
    appendFileSync(`${workspaceDir}/.git/info/exclude`, `${task.ignorePaths.join("\n")}\n`);
  }

  await runCommand({ cmd: ["git", "add", "-A"], cwd: workspaceDir, env, timeoutMs: 10_000 });
  await runCommand({
    cmd: ["git", "commit", "-q", "-m", "baseline"],
    cwd: workspaceDir,
    env,
    timeoutMs: 10_000,
  });
  const baselineSha = await currentHeadSha(workspaceDir);

  let setupOutput: ProvisionedWorkspace["setupOutput"];
  if (task.setup) {
    const setupResult = await runCommand({
      cmd: ["bash", "-c", task.setup],
      cwd: workspaceDir,
      env: gitEnv(),
      timeoutMs: DEFAULT_SETUP_TIMEOUT_MS,
    });
    setupOutput = {
      stdout: setupResult.stdout,
      stderr: setupResult.stderr,
      exitCode: setupResult.exitCode,
      timedOut: setupResult.timedOut,
    };
    if (setupResult.timedOut || setupResult.exitCode !== 0) {
      const detail = setupResult.timedOut
        ? "timed out"
        : `exit ${setupResult.exitCode}: ${setupResult.stderr || setupResult.stdout}`.trim();
      throw new Error(`fixture task setup failed (${detail})`);
    }
  }

  await runCommand({ cmd: ["git", "add", "-A"], cwd: workspaceDir, env, timeoutMs: 10_000 });
  let postSetupSha = baselineSha;
  if (await hasUncommittedChanges(workspaceDir)) {
    await runCommand({
      cmd: ["git", "commit", "-q", "-m", "post-setup"],
      cwd: workspaceDir,
      env,
      timeoutMs: 10_000,
    });
    postSetupSha = await currentHeadSha(workspaceDir);
  }

  return { dir: workspaceDir, baselineSha, postSetupSha, setupOutput };
}

export interface CapturedDiff {
  patch: string;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}

const SHORTSTAT_REGEX =
  /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/;

export async function captureDiff(workspaceDir: string, postSetupSha: string): Promise<CapturedDiff> {
  const env = gitEnv();
  await runCommand({ cmd: ["git", "add", "-A"], cwd: workspaceDir, env, timeoutMs: 10_000 });

  const patchResult = await runCommand({
    cmd: ["git", "diff", postSetupSha, "--staged"],
    cwd: workspaceDir,
    env,
    timeoutMs: 15_000,
  });
  const statResult = await runCommand({
    cmd: ["git", "diff", postSetupSha, "--staged", "--shortstat"],
    cwd: workspaceDir,
    env,
    timeoutMs: 15_000,
  });

  const match = statResult.stdout.match(SHORTSTAT_REGEX);
  return {
    patch: patchResult.stdout,
    filesChanged: match?.[1] ? Number(match[1]) : 0,
    linesAdded: match?.[2] ? Number(match[2]) : 0,
    linesRemoved: match?.[3] ? Number(match[3]) : 0,
  };
}

/** Overlays the task's hidden tests, overwriting any same-named path the agent may have tampered with. */
export async function overlayHiddenTests(task: FixtureSweTask, workspaceDir: string): Promise<void> {
  const result = await runCommand({
    cmd: ["cp", "-R", `${task.hiddenDir}/.`, `${workspaceDir}/`],
    cwd: workspaceDir,
    env: buildHarnessEnv(),
    timeoutMs: 15_000,
  });
  if (result.exitCode !== 0) {
    throw new Error(`failed to overlay hidden tests from ${task.hiddenDir}: ${result.stderr}`);
  }
}

export interface VerifyResult {
  command: string;
  exitCode?: number;
  passed: boolean;
  timedOut: boolean;
  output: string;
  durationMs: number;
}

function tail(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf-8") <= maxBytes) return text;
  const buf = Buffer.from(text, "utf-8");
  return buf.subarray(buf.length - maxBytes).toString("utf-8");
}

export async function runVerify(task: VerifiableTask, workspaceDir: string): Promise<VerifyResult> {
  const env = { ...buildHarnessEnv({ extraKeys: task.envPassthrough }), CI: "1" };
  const result = await runCommand({
    cmd: ["bash", "-c", task.verify],
    cwd: workspaceDir,
    env,
    timeoutMs: task.verifyTimeoutMs,
  });

  return {
    command: task.verify,
    exitCode: result.timedOut ? undefined : result.exitCode,
    passed: !result.timedOut && result.exitCode === 0,
    timedOut: result.timedOut,
    output: tail(`${result.stdout}\n${result.stderr}`.trim(), MAX_VERIFY_OUTPUT_BYTES),
    durationMs: result.latencyMs,
  };
}

export async function cleanupWorkspace(workspaceDir: string): Promise<void> {
  await rm(workspaceDir, { recursive: true, force: true });
}

export function ensureWorkspacesRoot(workspacesRoot: string): void {
  mkdirSync(dirname(workspacesRoot), { recursive: true });
  mkdirSync(workspacesRoot, { recursive: true });
}
