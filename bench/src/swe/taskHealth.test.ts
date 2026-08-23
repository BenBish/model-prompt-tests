import { describe, expect, test } from "bun:test";
import { assessValidationRuns, isComparableTask, missingPrerequisites } from "./taskHealth";
import type { SweTask } from "./taskSpec";
import type { VerifyResult } from "./workspace";

const task = { id: "swe-tasks/fixture/example", lifecycle: "active", graderVersion: "1.0.0", runtimePrerequisites: [] } as unknown as SweTask;
const result = (passed: boolean, testsTotal = 9): VerifyResult => ({ command: "bun test", passed, timedOut: false, exitCode: passed ? 0 : 1, output: "", durationMs: 1, testsPassed: passed ? testsTotal : testsTotal - 1, testsTotal });

describe("task health", () => {
  test("requires five stable, passing oracle repetitions and rejected flawed solutions", () => {
    const record = assessValidationRuns(task, Array.from({ length: 5 }, () => result(true)), [result(false)]);
    expect(record.status).toBe("healthy");
    expect(record.testCount).toBe(9);
    expect(isComparableTask(task, record)).toBe(true);
  });

  test("quarantines a flaky oracle", () => {
    const record = assessValidationRuns(task, [result(true), result(false), result(true), result(true), result(true)], [result(false)]);
    expect(record.status).toBe("unhealthy");
    expect(record.reasons).toContain("oracle did not pass 100% of repetitions");
  });

  test("quarantines changing verifier test counts", () => {
    const record = assessValidationRuns(task, [result(true, 9), result(true, 9), result(true, 8), result(true, 9), result(true, 9)], [result(false)]);
    expect(record.status).toBe("unhealthy");
    expect(record.reasons.some((reason) => reason.includes("test count changed"))).toBe(true);
  });

  test("classifies missing prerequisites as infrastructure failure", () => {
    const record = assessValidationRuns(task, [], [], ["podman"]);
    expect(record.status).toBe("infrastructure-failure");
    expect(isComparableTask(task, record)).toBe(false);
  });

  test("accepts alternative runtime prerequisites when any executable exists", () => {
    const withAlternatives = { ...task, runtimePrerequisites: ["definitely-missing-command|bun"] };
    expect(missingPrerequisites(withAlternatives)).toEqual([]);
  });
});
