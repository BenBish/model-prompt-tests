import { describe, expect, test } from "bun:test";
import type { PromptDefinition } from "../types";
import type { ModelAdapter } from "../providers/types";
import { runJudge } from "./judge";

const prompt: PromptDefinition = {
  id: "test/prompt",
  filePath: "test/prompt.md",
  title: "Test prompt",
  promptText: "Return an object.",
  whatThisTests: [],
  strongSignals: [],
  weakSignals: [],
  rubric: [
    { score: 5, description: "Excellent" },
    { score: 4, description: "Good" },
    { score: 3, description: "Acceptable" },
    { score: 2, description: "Weak" },
    { score: 1, description: "Poor" },
  ],
};

test("accepts braces and escaped quotes inside a judge rationale", async () => {
  const responseText =
    '{"score":5,"rationale":"Correctly uses the object {\\\"key\\\": \\\"value\\\"}."}';
  const adapter: ModelAdapter = {
    providerId: "test",
    modelName: "test-judge",
    async call() {
      return {
        text: responseText,
        raw: {},
        latencyMs: 1,
      };
    },
  };

  const outcome = await runJudge(adapter, prompt, "candidate output");

  expect(outcome.result).toEqual({
    score: 5,
    rationale: 'Correctly uses the object {"key": "value"}.',
  });
});

describe("judge request failures", () => {
  test("preserves the underlying request error", async () => {
    let calls = 0;
    const adapter: ModelAdapter = {
      providerId: "test",
      modelName: "test-judge",
      async call() {
        calls++;
        const error = new Error("API error 401: unauthorized") as Error & {
          status?: number;
        };
        error.status = 401;
        throw error;
      },
    };

    const outcome = await runJudge(adapter, prompt, "candidate output");

    expect(outcome.error).toBe("judge request failed: API error 401: unauthorized");
    expect(calls).toBe(1);
  });

  test("retries transient request failures with backoff", async () => {
    let calls = 0;
    const adapter: ModelAdapter = {
      providerId: "test",
      modelName: "test-judge",
      async call() {
        calls++;
        if (calls === 1) {
          const error = new Error("API error 429: rate limited") as Error & {
            status?: number;
          };
          error.status = 429;
          throw error;
        }
        return {
          text: '{"score":4,"rationale":"Good"}',
          raw: {},
          latencyMs: 1,
        };
      },
    };

    const outcome = await runJudge(adapter, prompt, "candidate output", {
      retry: { baseDelayMs: 1 },
    });

    expect(outcome.result).toEqual({ score: 4, rationale: "Good" });
    expect(calls).toBe(2);
  });
});
