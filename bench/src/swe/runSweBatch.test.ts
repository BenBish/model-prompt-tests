import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ModelAdapter } from "../providers/types";
import { getSweResultForRun } from "../db/sweResultsRepo";
import type { SweHarness, SweHarnessInput, SweHarnessResult } from "./harness/types";
import type { FixtureSweTask } from "./taskSpec";
import { runSweBatch, type SweRunnerCell } from "./runSweBatch";

const tempRoots: string[] = [];

function makeTempDir(): string {
  const root = mkdtempSync(join(tmpdir(), "bench-swe-batch-"));
  tempRoots.push(root);
  return root;
}

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  return db;
}

function makeFixtureTask(overrides: Partial<FixtureSweTask> = {}): FixtureSweTask {
  const taskDir = join(makeTempDir(), "task");
  const projectDir = join(taskDir, "project");
  const hiddenDir = join(taskDir, "hidden");
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(hiddenDir, { recursive: true });
  writeFileSync(join(projectDir, "value.txt"), "buggy\n");
  writeFileSync(join(projectDir, "visible.check"), "PASS\n");
  writeFileSync(join(hiddenDir, "hidden.check"), "PASS\n");

  return {
    id: "fixture/example",
    filePath: join(taskDir, "task.md"),
    taskDir,
    title: "Example",
    taskText: "Fix value.txt so it says fixed.",
    judgingGuidance: [],
    verifyTimeoutMs: 10_000,
    agentTimeoutMs: 20_000,
    tags: [],
    ignorePaths: ["node_modules"],
    envPassthrough: [],
    type: "fixture",
    // Verify both the visible check and the hidden overlay's own check, plus the real fix.
    verify: "grep -q fixed value.txt && test -f visible.check && test -f hidden.check",
    projectDir,
    hiddenDir,
    ...overrides,
  };
}

function fakeHarness(
  id: string,
  models: Record<string, string>,
  run: (input: SweHarnessInput) => Promise<SweHarnessResult>,
): SweHarness {
  return {
    harnessId: id,
    kind: "fake",
    resolveModel: (alias) => models[alias],
    async available() {
      return { ok: true };
    },
    run,
  };
}

afterEach(() => {
  spyOn(console, "log").mockRestore();
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe("runSweBatch", () => {
  test("a correct fix is recorded as ok + verify passed, with a captured diff", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    const task = makeFixtureTask();
    const workspacesRoot = join(makeTempDir(), "workspaces");

    const harness = fakeHarness("fake-cc", { sonnet: "fake-model" }, async (input) => {
      writeFileSync(join(input.workDir, "value.txt"), "fixed\n");
      return { finalMessage: "Fixed it", exitCode: 0, latencyMs: 12, timedOut: false, raw: {} };
    });
    const cells: SweRunnerCell[] = [{ harnessId: "fake-cc", harness, modelAlias: "sonnet" }];

    const summary = await runSweBatch({ db, tasks: [task], cells, workspacesRoot });

    expect(summary.ok).toBe(1);
    expect(summary.errored).toBe(0);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(0);

    const run = db.query("SELECT * FROM runs").get() as any;
    expect(run.status).toBe("ok");
    expect(run.kind).toBe("swe");
    expect(run.harness_id).toBe("fake-cc");
    expect(run.model_id).toBe("fake-cc:sonnet");

    const sweResult = getSweResultForRun(db, run.id);
    expect(sweResult?.verifyPassed).toBe(true);
    expect(sweResult?.diffPatch).toContain("value.txt");
    expect(sweResult?.diffPatch).toContain("+fixed");

    // Cleaned up on success by default.
    expect(existsSync(sweResult!.workdir!)).toBe(false);
  });

  test("hidden test overlay neutralizes an agent tampering with the visible check", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    const task = makeFixtureTask();
    const workspacesRoot = join(makeTempDir(), "workspaces");

    // The agent does NOT fix value.txt, and instead tampers with visible.check to fake success.
    const harness = fakeHarness("fake-cc", { sonnet: "fake-model" }, async (input) => {
      writeFileSync(join(input.workDir, "visible.check"), "PASS\n");
      return { finalMessage: "Fixed it (not really)", exitCode: 0, latencyMs: 12, timedOut: false, raw: {} };
    });
    const cells: SweRunnerCell[] = [{ harnessId: "fake-cc", harness, modelAlias: "sonnet" }];

    const summary = await runSweBatch({ db, tasks: [task], cells, workspacesRoot, keepWorkspaces: true });

    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(1);
    const run = db.query("SELECT * FROM runs").get() as any;
    const sweResult = getSweResultForRun(db, run.id);
    expect(sweResult?.verifyPassed).toBe(false);
    expect(sweResult?.verifyExitCode).not.toBe(0);
  });

  test("records a timed-out agent run and keeps the workspace for debugging", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    const task = makeFixtureTask({ verify: "test -f value.txt" });
    const workspacesRoot = join(makeTempDir(), "workspaces");

    const harness = fakeHarness("fake-cc", { sonnet: "fake-model" }, async () => ({
      finalMessage: "",
      exitCode: 1,
      latencyMs: 5000,
      timedOut: true,
      raw: {},
    }));
    const cells: SweRunnerCell[] = [{ harnessId: "fake-cc", harness, modelAlias: "sonnet" }];

    await runSweBatch({ db, tasks: [task], cells, workspacesRoot });

    const run = db.query("SELECT * FROM runs").get() as any;
    const sweResult = getSweResultForRun(db, run.id);
    expect(sweResult?.agentTimedOut).toBe(true);
    // Verify still runs against whatever the agent left behind; value.txt exists (unmodified: "buggy").
    expect(sweResult?.verifyPassed).toBe(true);
  });

  test("records an error run without a swe_results row for an unresolved model alias", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    const task = makeFixtureTask();
    const workspacesRoot = join(makeTempDir(), "workspaces");

    const harness = fakeHarness("fake-cc", { sonnet: "fake-model" }, async () => {
      throw new Error("should not be called");
    });
    const cells: SweRunnerCell[] = [{ harnessId: "fake-cc", harness, modelAlias: "unknown-alias" }];

    const summary = await runSweBatch({ db, tasks: [task], cells, workspacesRoot });

    expect(summary.errored).toBe(1);
    expect(summary.ok).toBe(0);
    const run = db.query("SELECT * FROM runs").get() as any;
    expect(run.status).toBe("error");
    expect(run.error).toContain('model alias "unknown-alias"');
    expect(getSweResultForRun(db, run.id)).toBeUndefined();
  });

  test("skips code-review tasks (Phase 4)", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    const reviewTask = {
      ...makeFixtureTask(),
      type: "code-review" as const,
      diffPatchPath: "/tmp/diff.patch",
      findingsPath: "/tmp/findings.json",
    };
    const workspacesRoot = join(makeTempDir(), "workspaces");
    const harness = fakeHarness("fake-cc", { sonnet: "fake-model" }, async () => {
      throw new Error("should not be called");
    });
    const cells: SweRunnerCell[] = [{ harnessId: "fake-cc", harness, modelAlias: "sonnet" }];

    const summary = await runSweBatch({ db, tasks: [reviewTask as any], cells, workspacesRoot });
    expect(summary.ok).toBe(0);
    expect(summary.errored).toBe(0);
    expect(db.query("SELECT COUNT(*) as c FROM runs").get()).toEqual({ c: 0 });
  });

  test("scores completed runs with a judge, including dimensions", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    const task = makeFixtureTask({
      dimensions: [
        { id: "correctness", weight: 3, description: "Fixes the bug." },
        { id: "code-quality", weight: 1, description: "Minimal diff." },
      ],
    });
    const workspacesRoot = join(makeTempDir(), "workspaces");
    const harness = fakeHarness("fake-cc", { sonnet: "fake-model" }, async (input) => {
      writeFileSync(join(input.workDir, "value.txt"), "fixed\n");
      return { finalMessage: "Fixed it", exitCode: 0, latencyMs: 12, timedOut: false, raw: {} };
    });
    const cells: SweRunnerCell[] = [{ harnessId: "fake-cc", harness, modelAlias: "sonnet" }];
    const judgeAdapter: ModelAdapter = {
      providerId: "judge",
      modelName: "judge",
      async call() {
        return {
          text: JSON.stringify({
            score: 5,
            rationale: "great",
            dimensions: {
              correctness: { score: 5, rationale: "fixed" },
              "code-quality": { score: 4, rationale: "clean" },
            },
          }),
          raw: {},
          latencyMs: 1,
        };
      },
    };

    await runSweBatch({
      db,
      tasks: [task],
      cells,
      workspacesRoot,
      judges: [{ adapter: judgeAdapter, modelId: "judge:test" }],
    });

    const score = db.query("SELECT * FROM scores").get() as any;
    expect(score.score).toBe(5);
    expect(JSON.parse(score.dimension_scores)).toEqual({
      correctness: { score: 5, rationale: "fixed" },
      "code-quality": { score: 4, rationale: "clean" },
    });
  });

  test("respects --repeats, running the same cell multiple times", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    const task = makeFixtureTask();
    const workspacesRoot = join(makeTempDir(), "workspaces");
    let callCount = 0;
    const harness = fakeHarness("fake-cc", { sonnet: "fake-model" }, async (input) => {
      callCount++;
      writeFileSync(join(input.workDir, "value.txt"), "fixed\n");
      return { finalMessage: "Fixed it", exitCode: 0, latencyMs: 5, timedOut: false, raw: {} };
    });
    const cells: SweRunnerCell[] = [{ harnessId: "fake-cc", harness, modelAlias: "sonnet" }];

    const summary = await runSweBatch({ db, tasks: [task], cells, workspacesRoot, repeats: 3 });

    expect(callCount).toBe(3);
    expect(summary.ok).toBe(3);
    const rows = db.query("SELECT repeat_index FROM runs ORDER BY repeat_index").all() as { repeat_index: number }[];
    expect(rows.map((r) => r.repeat_index)).toEqual([0, 1, 2]);
  });
});
