import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { loadTasks } from "./discoverTasks";

test("every fixture task is active with executable validation solutions", async () => {
  const repoRoot = process.cwd();
  const tasks = await loadTasks(repoRoot, "fixture/*");

  expect(tasks.length).toBeGreaterThan(0);
  for (const task of tasks) {
    expect(task.lifecycle, task.id).toBe("active");
    expect(task.graderVersion, task.id).not.toBe("unversioned");
    expect(task.verifierEnvironments?.length, task.id).toBeGreaterThan(0);
    expect(task.oracleSolution, task.id).toBeTruthy();
    expect(existsSync(`${task.taskDir}/${task.oracleSolution}`), task.id).toBe(true);
    expect(task.flawedSolutions?.length, task.id).toBeGreaterThan(0);
    for (const solution of task.flawedSolutions ?? []) {
      expect(existsSync(`${task.taskDir}/${solution}`), `${task.id}: ${solution}`).toBe(true);
    }
  }
});
