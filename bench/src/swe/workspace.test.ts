import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { FixtureSweTask } from "./taskSpec";
import {
  captureDiff,
  cleanupWorkspace,
  overlayHiddenTests,
  provisionFixtureWorkspace,
  runVerify,
  workspaceDirFor,
} from "./workspace";

const tempRoots: string[] = [];

function makeTempDir(): string {
  const root = mkdtempSync(join(tmpdir(), "bench-workspace-"));
  tempRoots.push(root);
  return root;
}

function makeFixtureTask(overrides: Partial<FixtureSweTask> = {}): FixtureSweTask {
  const root = makeTempDir();
  const taskDir = join(root, "task");
  const projectDir = join(taskDir, "project");
  const hiddenDir = join(taskDir, "hidden");
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(hiddenDir, { recursive: true });
  writeFileSync(join(projectDir, "value.txt"), "1\n");

  return {
    id: "fixture/example",
    filePath: join(taskDir, "task.md"),
    taskDir,
    title: "Example",
    taskText: "Do the thing.",
    judgingGuidance: [],
    verifyTimeoutMs: 10_000,
    agentTimeoutMs: 60_000,
    tags: [],
    ignorePaths: ["node_modules"],
    envPassthrough: [],
    type: "fixture",
    verify: "test -f value.txt",
    projectDir,
    hiddenDir,
    ...overrides,
  };
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe("workspaceDirFor", () => {
  test("sanitizes slashes in task/harness/model ids into a flat path", () => {
    const dir = workspaceDirFor("/root/workspaces", "batch-1", "fixture/smoke", "claude-code", "sonnet", 2);
    expect(dir).toBe("/root/workspaces/batch-1/fixture-smoke--claude-code--sonnet--r2");
  });
});

describe("provisionFixtureWorkspace", () => {
  test("copies the project, commits a baseline, and leaves the workspace clean", async () => {
    const task = makeFixtureTask();
    const workspaceDir = join(makeTempDir(), "ws");

    const provisioned = await provisionFixtureWorkspace(task, workspaceDir);

    expect(existsSync(join(workspaceDir, "value.txt"))).toBe(true);
    expect(provisioned.baselineSha).toMatch(/^[0-9a-f]{40}$/);
    expect(provisioned.postSetupSha).toBe(provisioned.baselineSha);
  });

  test("throws when setup exits non-zero", async () => {
    const task = makeFixtureTask({ setup: "exit 7" });
    const workspaceDir = join(makeTempDir(), "ws-setup-fail");
    await expect(provisionFixtureWorkspace(task, workspaceDir)).rejects.toThrow(/setup failed/);
  });

  test("commits a separate post-setup SHA only when setup changes files", async () => {
    const task = makeFixtureTask({ setup: "echo generated > generated.txt" });
    const workspaceDir = join(makeTempDir(), "ws");

    const provisioned = await provisionFixtureWorkspace(task, workspaceDir);

    expect(provisioned.postSetupSha).not.toBe(provisioned.baselineSha);
    expect(existsSync(join(workspaceDir, "generated.txt"))).toBe(true);
    expect(provisioned.setupOutput?.exitCode).toBe(0);
  });

  test("ignorePaths keep generated directories out of the agent's diff", async () => {
    const task = makeFixtureTask({ setup: "mkdir -p node_modules && echo x > node_modules/pkg.txt" });
    const workspaceDir = join(makeTempDir(), "ws");

    const provisioned = await provisionFixtureWorkspace(task, workspaceDir);
    // Simulate the agent editing a tracked file after provisioning.
    writeFileSync(join(workspaceDir, "value.txt"), "2\n");

    const diff = await captureDiff(workspaceDir, provisioned.postSetupSha);
    expect(diff.patch).toContain("value.txt");
    expect(diff.patch).not.toContain("node_modules");
  });
});

describe("captureDiff", () => {
  test("reports the agent's changes against the post-setup baseline", async () => {
    const task = makeFixtureTask();
    const workspaceDir = join(makeTempDir(), "ws");
    const provisioned = await provisionFixtureWorkspace(task, workspaceDir);

    writeFileSync(join(workspaceDir, "value.txt"), "2\n");
    writeFileSync(join(workspaceDir, "new-file.txt"), "new\n");

    const diff = await captureDiff(workspaceDir, provisioned.postSetupSha);
    expect(diff.filesChanged).toBe(2);
    expect(diff.linesAdded).toBeGreaterThan(0);
    expect(diff.patch).toContain("+2");
    expect(diff.patch).toContain("new-file.txt");
  });
});

describe("overlayHiddenTests", () => {
  test("overwrites a tampered file and adds new hidden files", async () => {
    const task = makeFixtureTask();
    writeFileSync(join(task.hiddenDir, "value.txt"), "hidden-value\n");
    writeFileSync(join(task.hiddenDir, "extra.txt"), "extra\n");
    const workspaceDir = join(makeTempDir(), "ws");
    await provisionFixtureWorkspace(task, workspaceDir);

    // Simulate the agent tampering with the visible file to fake a result.
    writeFileSync(join(workspaceDir, "value.txt"), "tampered\n");

    await overlayHiddenTests(task, workspaceDir);

    expect(await Bun.file(join(workspaceDir, "value.txt")).text()).toBe("hidden-value\n");
    expect(await Bun.file(join(workspaceDir, "extra.txt")).text()).toBe("extra\n");
  });
});

describe("runVerify", () => {
  test("passes when the verify command exits 0", async () => {
    const task = makeFixtureTask({ verify: "test -f value.txt" });
    const workspaceDir = join(makeTempDir(), "ws");
    await provisionFixtureWorkspace(task, workspaceDir);

    const result = await runVerify(task, workspaceDir);
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  test("fails when the verify command exits non-zero", async () => {
    const task = makeFixtureTask({ verify: "test -f does-not-exist.txt" });
    const workspaceDir = join(makeTempDir(), "ws");
    await provisionFixtureWorkspace(task, workspaceDir);

    const result = await runVerify(task, workspaceDir);
    expect(result.passed).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });

  test("fails and reports timedOut when verify exceeds verifyTimeoutMs", async () => {
    const task = makeFixtureTask({ verify: "sleep 5", verifyTimeoutMs: 200 });
    const workspaceDir = join(makeTempDir(), "ws");
    await provisionFixtureWorkspace(task, workspaceDir);

    const result = await runVerify(task, workspaceDir);
    expect(result.passed).toBe(false);
    expect(result.timedOut).toBe(true);
  });

  test("truncates verify output to the 64KB cap", async () => {
    const task = makeFixtureTask({ verify: "head -c 200000 /dev/zero | tr '\\0' 'a'" });
    const workspaceDir = join(makeTempDir(), "ws");
    await provisionFixtureWorkspace(task, workspaceDir);

    const result = await runVerify(task, workspaceDir);
    expect(result.output.length).toBeLessThanOrEqual(65 * 1024);
  });
});

describe("cleanupWorkspace", () => {
  test("removes the workspace directory", async () => {
    const task = makeFixtureTask();
    const workspaceDir = join(makeTempDir(), "ws");
    await provisionFixtureWorkspace(task, workspaceDir);
    expect(existsSync(workspaceDir)).toBe(true);

    await cleanupWorkspace(workspaceDir);
    expect(existsSync(workspaceDir)).toBe(false);
  });
});
