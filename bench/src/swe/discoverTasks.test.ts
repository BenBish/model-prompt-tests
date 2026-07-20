import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverTaskFiles, loadTasks, resolveTaskSelector } from "./discoverTasks";

const tempRoots: string[] = [];

function makeTempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "bench-swe-discover-"));
  tempRoots.push(root);
  return root;
}

function writeTask(root: string, relDir: string): void {
  const dir = join(root, relDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "task.md"),
    [
      "---",
      "type: fixture",
      "verify: bun test",
      "---",
      "# Test task",
      "",
      "## Task",
      "",
      "```text",
      "Do it.",
      "```",
      "",
    ].join("\n"),
  );
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe("discoverTaskFiles", () => {
  test("finds every task.md two levels under swe-tasks/", async () => {
    const root = makeTempRepo();
    writeTask(root, "swe-tasks/fixture/smoke");
    writeTask(root, "swe-tasks/fixture/debounce-fix");
    writeTask(root, "swe-tasks/external/some-repo");

    const files = await discoverTaskFiles(root);
    expect(files).toEqual([
      join(root, "swe-tasks/external/some-repo/task.md"),
      join(root, "swe-tasks/fixture/debounce-fix/task.md"),
      join(root, "swe-tasks/fixture/smoke/task.md"),
    ]);
  });

  test("ignores task.md files outside swe-tasks/", async () => {
    const root = makeTempRepo();
    writeTask(root, "swe-tasks/fixture/smoke");
    mkdirSync(join(root, "not-swe-tasks", "fixture", "other"), { recursive: true });
    writeFileSync(join(root, "not-swe-tasks", "fixture", "other", "task.md"), "not a task");

    const files = await discoverTaskFiles(root);
    expect(files).toEqual([join(root, "swe-tasks/fixture/smoke/task.md")]);
  });
});

describe("resolveTaskSelector", () => {
  test("resolves a single task by its directory id", async () => {
    const root = makeTempRepo();
    writeTask(root, "swe-tasks/fixture/smoke");
    writeTask(root, "swe-tasks/fixture/debounce-fix");

    const files = await resolveTaskSelector(root, "fixture/smoke");
    expect(files).toEqual([join(root, "swe-tasks/fixture/smoke/task.md")]);
  });

  test("does not allow selectors to escape the repo root", async () => {
    const root = makeTempRepo();
    writeTask(root, "swe-tasks/fixture/smoke");

    await expect(resolveTaskSelector(root, "../outside")).resolves.toEqual([]);
  });

  test("loadTasks parses every discovered task", async () => {
    const root = makeTempRepo();
    writeTask(root, "swe-tasks/fixture/smoke");

    const tasks = await loadTasks(root, "all");
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.id).toBe("swe-tasks/fixture/smoke");
    expect(tasks[0]?.type).toBe("fixture");
  });
});
