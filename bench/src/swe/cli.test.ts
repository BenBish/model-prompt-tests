import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tempRoots: string[] = [];
const cliPath = new URL("../cli.ts", import.meta.url).pathname;

function makeTempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "bench-swe-cli-"));
  tempRoots.push(root);
  mkdirSync(join(root, "bench", "data"), { recursive: true });
  mkdirSync(join(root, "bench", "reports"), { recursive: true });

  writeFileSync(
    join(root, "bench", "models.example.json"),
    `${JSON.stringify(
      {
        models: [
          {
            id: "local:test",
            kind: "openai-compatible",
            providerId: "local",
            modelName: "test-model",
            baseUrl: "http://localhost:8000/v1",
          },
        ],
        judge: { modelId: "local:test" },
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    join(root, "bench", "harnesses.example.json"),
    `${JSON.stringify(
      {
        harnesses: [
          { id: "claude-code", kind: "claude-code", models: { sonnet: "claude-sonnet-5" } },
          { id: "raw-api", kind: "raw-api" },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const taskDir = join(root, "swe-tasks", "fixture", "smoke");
  mkdirSync(join(taskDir, "project"), { recursive: true });
  mkdirSync(join(taskDir, "hidden"), { recursive: true });
  writeFileSync(join(taskDir, "project", "value.txt"), "1\n");
  writeFileSync(
    join(taskDir, "task.md"),
    [
      "---",
      "type: fixture",
      "verify: test -f value.txt",
      "---",
      "# Smoke",
      "",
      "## Task",
      "",
      "```text",
      "Do it.",
      "```",
      "",
    ].join("\n"),
  );

  return root;
}

function runCli(repoRoot: string, args: string[]) {
  return Bun.spawnSync({
    cmd: ["bun", cliPath, ...args],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe("bench swe list", () => {
  test("lists discovered tasks and the harness availability matrix", () => {
    const repoRoot = makeTempRepo();
    const result = runCli(repoRoot, ["swe", "list"]);

    expect(result.exitCode).toBe(0);
    const stdout = result.stdout.toString();
    expect(stdout).toContain("swe-tasks/fixture/smoke");
    expect(stdout).toContain("claude-code");
    expect(stdout).toContain("raw-api");
  });
});

describe("bench swe run validation", () => {
  test("requires a task selector", () => {
    const repoRoot = makeTempRepo();
    const result = runCli(repoRoot, ["swe", "run"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("usage: bench swe run");
  });

  test("requires --harnesses", () => {
    const repoRoot = makeTempRepo();
    const result = runCli(repoRoot, ["swe", "run", "fixture/smoke", "--models", "sonnet"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("--harnesses is required");
  });

  test("requires --models", () => {
    const repoRoot = makeTempRepo();
    const result = runCli(repoRoot, ["swe", "run", "fixture/smoke", "--harnesses", "claude-code"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("--models is required");
  });

  test("rejects an unknown harness id", () => {
    const repoRoot = makeTempRepo();
    const result = runCli(repoRoot, [
      "swe",
      "run",
      "fixture/smoke",
      "--harnesses",
      "bogus-harness",
      "--models",
      "sonnet",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('unknown harness id "bogus-harness"');
  });

  test("rejects an unresolved harness/model combination", () => {
    const repoRoot = makeTempRepo();
    const result = runCli(repoRoot, [
      "swe",
      "run",
      "fixture/smoke",
      "--harnesses",
      "claude-code",
      "--models",
      "bogus-alias",
      "--dry-run",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('model alias "bogus-alias" is not defined for harness "claude-code"');
  });

  test("rejects duplicate --harnesses values", () => {
    const repoRoot = makeTempRepo();
    const result = runCli(repoRoot, [
      "swe",
      "run",
      "fixture/smoke",
      "--harnesses",
      "claude-code,claude-code",
      "--models",
      "sonnet",
      "--dry-run",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('duplicate value in --harnesses: "claude-code"');
  });

  test("rejects duplicate --models values", () => {
    const repoRoot = makeTempRepo();
    const result = runCli(repoRoot, [
      "swe",
      "run",
      "fixture/smoke",
      "--harnesses",
      "claude-code",
      "--models",
      "sonnet,sonnet",
      "--dry-run",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('duplicate value in --models: "sonnet"');
  });

  test("--dry-run resolves the matrix and spawns nothing", () => {
    const repoRoot = makeTempRepo();
    const result = runCli(repoRoot, [
      "swe",
      "run",
      "fixture/smoke",
      "--harnesses",
      "claude-code",
      "--models",
      "sonnet",
      "--dry-run",
    ]);

    expect(result.exitCode).toBe(0);
    const stdout = result.stdout.toString();
    expect(stdout).toContain("Would run 1 task(s) x 1 harness/model cell(s)");
    expect(stdout).toContain("cell: claude-code:sonnet");
    expect(stdout).toContain("no processes spawned, no network calls made");
  });

  test("--dry-run resolves raw-api aliases against bench/models.json", () => {
    const repoRoot = makeTempRepo();
    const result = runCli(repoRoot, [
      "swe",
      "run",
      "all",
      "--harnesses",
      "raw-api",
      "--models",
      "local:test",
      "--dry-run",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("cell: raw-api:local:test");
  });
});
