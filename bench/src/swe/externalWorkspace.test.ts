import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ExternalSweTask } from "./taskSpec";
import {
  cacheDirFor,
  ensureCachedRepo,
  prepareExternalVerify,
  provisionExternalWorkspace,
  removeExternalWorktree,
  repoCacheKey,
  resolveRepoUrl,
} from "./externalWorkspace";
import { captureDiff, runVerify } from "./workspace";

const tempRoots: string[] = [];

function makeTempDir(): string {
  const root = mkdtempSync(join(tmpdir(), "bench-external-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

async function makeLocalSourceRepo(): Promise<{ repoPath: string; commitSha: string }> {
  const repoPath = join(makeTempDir(), "source");
  mkdirSync(join(repoPath, "src"), { recursive: true });
  mkdirSync(join(repoPath, "tests"), { recursive: true });
  writeFileSync(join(repoPath, "src", "add.ts"), "export const add = (a: number, b: number) => a - b;\n");
  writeFileSync(
    join(repoPath, "tests", "add.test.ts"),
    `import { expect, test } from "bun:test";
import { add } from "../src/add";
test("adds", () => { expect(add(2, 3)).toBe(5); });
`,
  );
  writeFileSync(join(repoPath, "package.json"), `{"name":"t","private":true,"type":"module"}\n`);

  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "bench",
    GIT_AUTHOR_EMAIL: "bench@localhost",
    GIT_COMMITTER_NAME: "bench",
    GIT_COMMITTER_EMAIL: "bench@localhost",
  };
  const run = (cmd: string[]) =>
    Bun.spawnSync({ cmd, cwd: repoPath, env, stdout: "pipe", stderr: "pipe" });
  run(["git", "init", "-q", "-b", "main"]);
  run(["git", "add", "-A"]);
  run(["git", "commit", "-q", "-m", "seed"]);
  const sha = Bun.spawnSync({
    cmd: ["git", "rev-parse", "HEAD"],
    cwd: repoPath,
    env,
    stdout: "pipe",
  })
    .stdout.toString()
    .trim();
  return { repoPath, commitSha: sha };
}

function makeExternalTask(
  repoPath: string,
  commitSha: string,
  overrides: Partial<ExternalSweTask> = {},
): ExternalSweTask {
  const taskDir = join(makeTempDir(), "task");
  mkdirSync(taskDir, { recursive: true });
  return {
    id: "external/test",
    filePath: join(taskDir, "task.md"),
    taskDir,
    title: "Test",
    taskText: "Fix add.",
    judgingGuidance: [],
    verifyTimeoutMs: 30_000,
    agentTimeoutMs: 60_000,
    tags: [],
    ignorePaths: ["node_modules"],
    envPassthrough: [],
    type: "external",
    verify: "bun test",
    repoUrl: repoPath,
    commitSha,
    testPaths: ["tests/add.test.ts"],
    ...overrides,
  };
}

describe("resolveRepoUrl / repoCacheKey", () => {
  test("absolute and scheme URLs pass through; relative resolves against taskDir", () => {
    const task = makeExternalTask("/abs/repo", "abc");
    expect(resolveRepoUrl({ ...task, repoUrl: "https://example.com/r.git" })).toBe(
      "https://example.com/r.git",
    );
    expect(resolveRepoUrl({ ...task, repoUrl: "/abs/repo" })).toBe("/abs/repo");
    expect(resolveRepoUrl({ ...task, repoUrl: "./source.bundle" })).toBe(
      join(task.taskDir, "source.bundle"),
    );
    expect(repoCacheKey("https://a")).toHaveLength(16);
    expect(cacheDirFor("/cache", "https://a")).toContain(repoCacheKey("https://a"));
  });
});

describe("external workspace provisioning", () => {
  test("clones once into cache and reuses it on second ensureCachedRepo", async () => {
    const { repoPath, commitSha } = await makeLocalSourceRepo();
    const cacheRoot = join(makeTempDir(), "repo-cache");

    const first = await ensureCachedRepo(repoPath, cacheRoot);
    expect(existsSync(first)).toBe(true);
    const second = await ensureCachedRepo(repoPath, cacheRoot);
    expect(second).toBe(first);

    // Cache key stable for same URL.
    expect(second).toBe(cacheDirFor(cacheRoot, repoPath));
    void commitSha;
  });

  test("worktree provision + holdout patch + verify pass after agent-like fix", async () => {
    const { repoPath, commitSha } = await makeLocalSourceRepo();
    const taskDir = join(makeTempDir(), "task");
    mkdirSync(taskDir, { recursive: true });

    // Generate a real git-apply-able holdout patch from a temporary checkout.
    const patchBuild = join(makeTempDir(), "patch-build");
    Bun.spawnSync({
      cmd: ["git", "clone", "-q", repoPath, patchBuild],
      stdout: "pipe",
      stderr: "pipe",
    });
    writeFileSync(
      join(patchBuild, "tests", "hidden.test.ts"),
      `import { expect, test } from "bun:test";
import { add } from "../src/add";
test("hidden", () => { expect(add(1, 1)).toBe(2); });
`,
    );
    Bun.spawnSync({
      cmd: ["git", "add", "tests/hidden.test.ts"],
      cwd: patchBuild,
      stdout: "pipe",
      stderr: "pipe",
    });
    const patchResult = Bun.spawnSync({
      cmd: ["git", "diff", "--cached"],
      cwd: patchBuild,
      stdout: "pipe",
      stderr: "pipe",
    });
    writeFileSync(join(taskDir, "holdout.patch"), patchResult.stdout.toString());

    const task = makeExternalTask(repoPath, commitSha, {
      taskDir,
      filePath: join(taskDir, "task.md"),
      holdoutPatch: "holdout.patch",
      testPaths: ["tests/add.test.ts"],
    });

    const cacheRoot = join(makeTempDir(), "repo-cache");
    const workspaceDir = join(makeTempDir(), "ws");
    const provisioned = await provisionExternalWorkspace(task, workspaceDir, cacheRoot);
    expect(provisioned.baselineSha).toMatch(/^[0-9a-f]{40}$/);
    expect(existsSync(join(workspaceDir, "src", "add.ts"))).toBe(true);

    // Simulate agent fix.
    writeFileSync(join(workspaceDir, "src", "add.ts"), "export const add = (a: number, b: number) => a + b;\n");
    const diff = await captureDiff(workspaceDir, provisioned.postSetupSha);
    expect(diff.filesChanged).toBeGreaterThan(0);

    await prepareExternalVerify(task, workspaceDir);
    expect(existsSync(join(workspaceDir, "tests", "hidden.test.ts"))).toBe(true);

    const verify = await runVerify(task, workspaceDir);
    expect(verify.passed).toBe(true);

    await removeExternalWorktree(workspaceDir, provisioned.cacheDir);
    expect(existsSync(workspaceDir)).toBe(false);
  });

  test("second clone of same URL is offline-cached (same cache dir)", async () => {
    const { repoPath, commitSha } = await makeLocalSourceRepo();
    const task = makeExternalTask(repoPath, commitSha);
    const cacheRoot = join(makeTempDir(), "repo-cache");

    const a = await provisionExternalWorkspace(task, join(makeTempDir(), "ws-a"), cacheRoot);
    const b = await provisionExternalWorkspace(task, join(makeTempDir(), "ws-b"), cacheRoot);
    expect(a.cacheDir).toBe(b.cacheDir);

    await removeExternalWorktree(a.dir, a.cacheDir);
    await removeExternalWorktree(b.dir, b.cacheDir);
  });
});
