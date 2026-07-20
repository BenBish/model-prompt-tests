import { describe, expect, test } from "bun:test";
import type { ModelAdapter } from "../providers/types";
import type { FixtureSweTask } from "./taskSpec";
import { runSweJudge } from "./sweJudge";

const task: FixtureSweTask = {
  id: "fixture/example",
  filePath: "swe-tasks/fixture/example/task.md",
  taskDir: "swe-tasks/fixture/example",
  title: "Example task",
  taskText: "Fix the bug.",
  judgingGuidance: [],
  verifyTimeoutMs: 30_000,
  agentTimeoutMs: 300_000,
  tags: [],
  ignorePaths: [],
  envPassthrough: [],
  type: "fixture",
  verify: "bun test",
  projectDir: "swe-tasks/fixture/example/project",
  hiddenDir: "swe-tasks/fixture/example/hidden",
  dimensions: [
    { id: "correctness", weight: 3, description: "Fixes the bug." },
    { id: "code-quality", weight: 1, description: "Minimal diff." },
  ],
};

describe("runSweJudge", () => {
  test("parses a holistic + dimensional result and computes a weighted score", async () => {
    const adapter: ModelAdapter = {
      providerId: "test",
      modelName: "test-judge",
      async call() {
        return {
          text: JSON.stringify({
            score: 4,
            rationale: "Minimal, correct fix.",
            dimensions: {
              correctness: { score: 5, rationale: "Fixed the root cause" },
              "code-quality": { score: 3, rationale: "A bit verbose" },
            },
          }),
          raw: {},
          latencyMs: 1,
        };
      },
    };

    const outcome = await runSweJudge(adapter, task, "diff --git a/x b/x", undefined, "Done");
    expect(outcome.result?.dimensions?.correctness?.score).toBe(5);
    expect(outcome.result?.weightedScore).toBeCloseTo(4.5);
  });

  test("retries with a corrective message and eventually gives up", async () => {
    let calls = 0;
    const adapter: ModelAdapter = {
      providerId: "test",
      modelName: "test-judge",
      async call() {
        calls++;
        return { text: "not json", raw: {}, latencyMs: 1 };
      },
    };

    const outcome = await runSweJudge(adapter, task, "diff", undefined, "Done");
    // 1 structured-schema attempt (invalid payload) + 2 plain-text corrective attempts.
    expect(calls).toBe(3);
    expect(outcome.result).toBeNull();
    expect(outcome.error).toBe("swe judge did not return a valid JSON score after 2 attempts");
  });

  test("preserves the underlying request error", async () => {
    const adapter: ModelAdapter = {
      providerId: "test",
      modelName: "test-judge",
      async call() {
        throw new Error("API error 500: internal error");
      },
    };

    const outcome = await runSweJudge(adapter, task, "diff", undefined, "Done");
    expect(outcome.error).toBe("swe judge request failed: API error 500: internal error");
  });
});
