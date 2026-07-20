import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { buildHarnessEnv } from "./harness/env";
import { runCommand } from "./harness/runCommand";
import type { ExternalSweTask } from "./taskSpec";
import type { ProvisionedWorkspace } from "./workspace";

const DEFAULT_SETUP_TIMEOUT_MS = 120_000;
const CLONE_TIMEOUT_MS = 600_000;
const GIT_TIMEOUT_MS = 60_000;

function gitEnv(): Record<string, string> {
  return {
    ...buildHarnessEnv(),
    GIT_AUTHOR_NAME: "bench",
    GIT_AUTHOR_EMAIL: "bench@localhost",
    GIT_COMMITTER_NAME: "bench",
    GIT_COMMITTER_EMAIL: "bench@localhost",
  };
}

/** Stable cache directory name for a repo URL (or local path). */
export function repoCacheKey(repoUrl: string): string {
  return createHash("sha256").update(repoUrl).digest("hex").slice(0, 16);
}

/**
 * Resolve task.repoUrl to something git can clone.
 * - URLs with a scheme (https://, file://, git@ via scp-like not supported as scheme) pass through
 * - Absolute paths pass through
 * - Relative paths resolve against the task directory (offline seed repos)
 */
export function resolveRepoUrl(task: ExternalSweTask): string {
  const raw = task.repoUrl.trim();
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return raw;
  if (isAbsolute(raw)) return raw;
  return resolve(task.taskDir, raw);
}

export function cacheDirFor(repoCacheRoot: string, repoUrl: string): string {
  return join(repoCacheRoot, repoCacheKey(repoUrl));
}

/**
 * Ensure a blob-less clone exists at repo-cache/<hash>/. Reuses the cache when present
 * (second run is offline for the same URL). Fetches the needed commit when missing.
 */
export async function ensureCachedRepo(repoUrl: string, repoCacheRoot: string): Promise<string> {
  mkdirSync(repoCacheRoot, { recursive: true });
  const cacheDir = cacheDirFor(repoCacheRoot, repoUrl);
  const env = gitEnv();

  if (!existsSync(join(cacheDir, ".git")) && !existsSync(join(cacheDir, "HEAD"))) {
    // Prefer a bare blob-less clone so worktrees are cheap and the cache is shared.
    const clone = await runCommand({
      cmd: [
        "git",
        "clone",
        "--filter=blob:none",
        "--bare",
        repoUrl,
        cacheDir,
      ],
      cwd: repoCacheRoot,
      env,
      timeoutMs: CLONE_TIMEOUT_MS,
    });
    if (clone.exitCode !== 0) {
      throw new Error(`failed to clone ${repoUrl}: ${clone.stderr || clone.stdout}`);
    }
  }

  return cacheDir;
}

async function ensureCommitPresent(cacheDir: string, commitSha: string): Promise<void> {
  const env = gitEnv();
  const has = await runCommand({
    cmd: ["git", "cat-file", "-e", `${commitSha}^{commit}`],
    cwd: cacheDir,
    env,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (has.exitCode === 0) return;

  // Try a fetch that brings the commit (and its trees; blobs stay on demand).
  const fetch = await runCommand({
    cmd: ["git", "fetch", "--filter=blob:none", "origin", commitSha],
    cwd: cacheDir,
    env,
    timeoutMs: CLONE_TIMEOUT_MS,
  });
  if (fetch.exitCode !== 0) {
    // Local path clones may not have "origin" — try fetch without refspec from default remote.
    const fetchAll = await runCommand({
      cmd: ["git", "fetch", "--filter=blob:none", "--all"],
      cwd: cacheDir,
      env,
      timeoutMs: CLONE_TIMEOUT_MS,
    });
    if (fetchAll.exitCode !== 0) {
      throw new Error(
        `commit ${commitSha} not present in cache and fetch failed: ${fetch.stderr || fetchAll.stderr}`,
      );
    }
  }

  const recheck = await runCommand({
    cmd: ["git", "cat-file", "-e", `${commitSha}^{commit}`],
    cwd: cacheDir,
    env,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (recheck.exitCode !== 0) {
    throw new Error(`commit ${commitSha} still missing from cache after fetch`);
  }
}

async function currentHeadSha(dir: string): Promise<string> {
  const result = await runCommand({
    cmd: ["git", "rev-parse", "HEAD"],
    cwd: dir,
    env: gitEnv(),
    timeoutMs: GIT_TIMEOUT_MS,
  });
  return result.stdout.trim();
}

async function hasUncommittedChanges(dir: string): Promise<boolean> {
  const status = await runCommand({
    cmd: ["git", "status", "--porcelain"],
    cwd: dir,
    env: gitEnv(),
    timeoutMs: GIT_TIMEOUT_MS,
  });
  return status.stdout.trim().length > 0;
}

export interface ProvisionedExternalWorkspace extends ProvisionedWorkspace {
  cacheDir: string;
  resolvedRepoUrl: string;
}

/**
 * Provision an external task workspace via git worktree from the shared blob-less cache.
 * baselineSha is the pinned commit; postSetupSha may differ if `setup` mutates the tree.
 */
export async function provisionExternalWorkspace(
  task: ExternalSweTask,
  workspaceDir: string,
  repoCacheRoot: string,
): Promise<ProvisionedExternalWorkspace> {
  const resolvedRepoUrl = resolveRepoUrl(task);
  const cacheDir = await ensureCachedRepo(resolvedRepoUrl, repoCacheRoot);
  await ensureCommitPresent(cacheDir, task.commitSha);

  mkdirSync(join(workspaceDir, ".."), { recursive: true });
  // Remove a stale directory if a previous crash left one.
  if (existsSync(workspaceDir)) {
    await removeExternalWorktree(workspaceDir, cacheDir);
  }

  const env = gitEnv();
  const add = await runCommand({
    cmd: ["git", "worktree", "add", "--detach", workspaceDir, task.commitSha],
    cwd: cacheDir,
    env,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (add.exitCode !== 0) {
    throw new Error(`git worktree add failed for ${task.commitSha}: ${add.stderr || add.stdout}`);
  }

  if (task.ignorePaths.length > 0) {
    // worktree has a .git file pointing at the cache; local excludes still work under .git/info when real dir
    const excludePath = join(workspaceDir, ".git", "info", "exclude");
    // In a linked worktree, .git is a file — put excludes in the worktree's git dir via git.
    await runCommand({
      cmd: ["git", "config", "core.excludesFile", join(workspaceDir, ".git", "info", "exclude")],
      cwd: workspaceDir,
      env,
      timeoutMs: 10_000,
    }).catch(() => undefined);
    void excludePath;
  }

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
  }

  let postSetupSha = baselineSha;
  if (await hasUncommittedChanges(workspaceDir)) {
    await runCommand({ cmd: ["git", "add", "-A"], cwd: workspaceDir, env, timeoutMs: 15_000 });
    await runCommand({
      cmd: ["git", "commit", "-q", "-m", "post-setup"],
      cwd: workspaceDir,
      env,
      timeoutMs: 15_000,
    });
    postSetupSha = await currentHeadSha(workspaceDir);
  }

  return {
    dir: workspaceDir,
    baselineSha,
    postSetupSha,
    setupOutput,
    cacheDir,
    resolvedRepoUrl,
  };
}

/**
 * Before verify: reset listed testPaths to the pinned commit (SWE-bench style),
 * then apply an optional holdout patch from the task directory.
 */
export async function prepareExternalVerify(task: ExternalSweTask, workspaceDir: string): Promise<void> {
  const env = gitEnv();

  if (task.testPaths.length > 0) {
    const checkout = await runCommand({
      cmd: ["git", "checkout", task.commitSha, "--", ...task.testPaths],
      cwd: workspaceDir,
      env,
      timeoutMs: GIT_TIMEOUT_MS,
    });
    if (checkout.exitCode !== 0) {
      throw new Error(
        `failed to reset testPaths to ${task.commitSha}: ${checkout.stderr || checkout.stdout}`,
      );
    }
  }

  if (task.holdoutPatch) {
    const patchPath = isAbsolute(task.holdoutPatch)
      ? task.holdoutPatch
      : join(task.taskDir, task.holdoutPatch);
    if (!existsSync(patchPath)) {
      throw new Error(`holdoutPatch not found: ${patchPath}`);
    }
    const apply = await runCommand({
      cmd: ["git", "apply", "--whitespace=nowarn", patchPath],
      cwd: workspaceDir,
      env,
      timeoutMs: GIT_TIMEOUT_MS,
    });
    if (apply.exitCode !== 0) {
      // Retry with 3-way for slightly drifted trees.
      const apply3 = await runCommand({
        cmd: ["git", "apply", "--3way", "--whitespace=nowarn", patchPath],
        cwd: workspaceDir,
        env,
        timeoutMs: GIT_TIMEOUT_MS,
      });
      if (apply3.exitCode !== 0) {
        throw new Error(`failed to apply holdoutPatch ${patchPath}: ${apply.stderr || apply3.stderr}`);
      }
    }
  }
}

/** Remove a worktree directory and prune it from the cache repo. */
export async function removeExternalWorktree(workspaceDir: string, cacheDir: string): Promise<void> {
  const env = gitEnv();
  if (existsSync(cacheDir)) {
    await runCommand({
      cmd: ["git", "worktree", "remove", "--force", workspaceDir],
      cwd: cacheDir,
      env,
      timeoutMs: GIT_TIMEOUT_MS,
    });
    await runCommand({
      cmd: ["git", "worktree", "prune"],
      cwd: cacheDir,
      env,
      timeoutMs: GIT_TIMEOUT_MS,
    });
  }
  // Force-remove if worktree remove failed (e.g. already gone from registry).
  if (existsSync(workspaceDir)) {
    const { rm } = await import("node:fs/promises");
    await rm(workspaceDir, { recursive: true, force: true });
  }
}

/** Read a holdout patch file for tests/debug. */
export function readHoldoutPatch(task: ExternalSweTask): string | undefined {
  if (!task.holdoutPatch) return undefined;
  const patchPath = isAbsolute(task.holdoutPatch)
    ? task.holdoutPatch
    : join(task.taskDir, task.holdoutPatch);
  if (!existsSync(patchPath)) return undefined;
  return readFileSync(patchPath, "utf8");
}
