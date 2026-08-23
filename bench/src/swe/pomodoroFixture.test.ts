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

async function verifySolution(kind: "reference" | "naive" | "naive-literal") {
  const task = (await parseTaskFile(taskPath, repoRoot)) as FixtureSweTask;
  const workspace = mkdtempSync(join(tmpdir(), `pomodoro-${kind}-`));
  try {
    await provisionFixtureWorkspace(task, workspace);
    if (kind === "naive-literal") {
      cpSync(join(task.taskDir, "validation/naive-literal/src"), join(workspace, "src"), { recursive: true });
    } else {
      cpSync(join(task.taskDir, "validation/reference/src"), join(workspace, "src"), { recursive: true });
      if (kind === "naive") {
        cpSync(join(task.taskDir, "validation/naive/src/timer.js"), join(workspace, "src/timer.js"));
      }
    }
    await overlayHiddenTests(task, workspace);
    return await runVerify(task, workspace);
  } finally {
    await cleanupWorkspace(workspace);
  }
}

function expectHealthy(result: Awaited<ReturnType<typeof verifySolution>>) {
  if (!result.passed) throw new Error(`Pomodoro verifier failed:\n${result.output}`);
  expect(result.output).toContain("9 pass");
}

test(
  "Pomodoro fixture accepts the reference implementation",
  async () => {
    const result = await verifySolution("reference");
    expectHealthy(result);
  },
  120_000,
);

test(
  "Pomodoro fixture rejects a plausible decrement-per-tick implementation",
  async () => {
    const result = await verifySolution("naive");
    expect(result.passed).toBe(false);
    expect(result.output).toContain("uses elapsed time when interval delivery is delayed");
    expect(result.output).toContain("never starts duplicate intervals");
  },
  120_000,
);

test(
  "Pomodoro fixture accepts an independent implementation that only follows the disclosed contract",
  async () => {
    const result = await verifySolution("naive-literal");
    expectHealthy(result);
  },
  120_000,
);
