import { expect, test } from "bun:test";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseTaskFile, type FixtureSweTask } from "./taskSpec";
import {
  cleanupWorkspace,
  overlayHiddenTests,
  provisionFixtureWorkspace,
  runVerify,
} from "./workspace";

const repoRoot = resolve(import.meta.dir, "../../..");
const taskPath = join(repoRoot, "swe-tasks/fixture/pomodoro-timer/task.md");

async function verifySolution(kind: "reference" | "naive") {
  const task = (await parseTaskFile(taskPath, repoRoot)) as FixtureSweTask;
  const workspace = mkdtempSync(join(tmpdir(), `pomodoro-${kind}-`));
  try {
    await provisionFixtureWorkspace(task, workspace);
    cpSync(join(task.taskDir, "validation/reference/src"), join(workspace, "src"), { recursive: true });
    if (kind === "naive") {
      cpSync(join(task.taskDir, "validation/naive/src/timer.js"), join(workspace, "src/timer.js"));
    }
    await overlayHiddenTests(task, workspace);
    return await runVerify(task, workspace);
  } finally {
    await cleanupWorkspace(workspace);
  }
}

test(
  "Pomodoro fixture accepts the reference implementation",
  async () => {
    const result = await verifySolution("reference");
    expect(result.passed).toBe(true);
    expect(result.output).toContain("9 pass");
  },
  30_000,
);

test(
  "Pomodoro fixture rejects a plausible decrement-per-tick implementation",
  async () => {
    const result = await verifySolution("naive");
    expect(result.passed).toBe(false);
    expect(result.output).toContain("uses elapsed time when interval delivery is delayed");
    expect(result.output).toContain("never starts duplicate intervals");
  },
  30_000,
);
