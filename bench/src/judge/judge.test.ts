import { describe, expect, test } from "bun:test";
import type { PromptDefinition } from "../types";
import type { ModelAdapter, ModelCallInput } from "../providers/types";
import { runJudge } from "./judge";
import { buildJudgeResultJsonSchema } from "./structuredCall";

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

describe("structured JSON-schema judging", () => {
  test("requests a JSON schema on the first attempt and accepts a matching reply", async () => {
    let receivedInput: ModelCallInput | undefined;
    const adapter: ModelAdapter = {
      providerId: "test",
      modelName: "test-judge",
      async call(input) {
        receivedInput = input;
        return { text: '{"score":3,"rationale":"Acceptable"}', raw: {}, latencyMs: 1 };
      },
    };

    const outcome = await runJudge(adapter, prompt, "candidate output");

    expect(outcome.result).toEqual({ score: 3, rationale: "Acceptable" });
    expect(receivedInput?.jsonSchema?.name).toBe("submit_score");
  });

  test("includes dimensions in the schema when the prompt defines them", async () => {
    let receivedInput: ModelCallInput | undefined;
    const withDims: PromptDefinition = {
      ...prompt,
      dimensions: [{ id: "correctness", weight: 2, description: "Right answer" }],
    };
    const adapter: ModelAdapter = {
      providerId: "test",
      modelName: "test-judge",
      async call(input) {
        receivedInput = input;
        return {
          text: JSON.stringify({
            score: 4,
            rationale: "Good",
            dimensions: { correctness: { score: 4, rationale: "ok" } },
          }),
          raw: {},
          latencyMs: 1,
        };
      },
    };

    await runJudge(adapter, withDims, "candidate output");

    const schema = receivedInput?.jsonSchema?.schema as {
      required?: string[];
      properties?: { dimensions?: unknown };
    };
    expect(schema?.required).toContain("dimensions");
    expect(schema?.properties?.dimensions).toBeDefined();
    expect(buildJudgeResultJsonSchema(withDims.dimensions).schema).toMatchObject({
      required: expect.arrayContaining(["score", "rationale", "dimensions"]),
    });
  });

  test("falls back to the plain-text contract when structured output looks unsupported", async () => {
    let calls = 0;
    const adapter: ModelAdapter = {
      providerId: "test",
      modelName: "test-judge",
      async call(input) {
        calls++;
        if (input.jsonSchema) {
          const error = new Error("API error 400: unknown parameter 'response_format'") as Error & {
            status?: number;
          };
          error.status = 400;
          throw error;
        }
        return { text: '{"score":2,"rationale":"Weak"}', raw: {}, latencyMs: 1 };
      },
    };

    const outcome = await runJudge(adapter, prompt, "candidate output");

    expect(outcome.result).toEqual({ score: 2, rationale: "Weak" });
    expect(calls).toBe(2);
  });

  test("does not fall back on an unrelated non-400 structured-attempt failure", async () => {
    let calls = 0;
    const adapter: ModelAdapter = {
      providerId: "test",
      modelName: "test-judge",
      async call() {
        calls++;
        const error = new Error("API error 401: unauthorized") as Error & { status?: number };
        error.status = 401;
        throw error;
      },
    };

    const outcome = await runJudge(adapter, prompt, "candidate output");

    expect(outcome.error).toBe("judge request failed: API error 401: unauthorized");
    expect(calls).toBe(1);
  });
});

describe("dimensional judging", () => {
  const promptWithDimensions: PromptDefinition = {
    ...prompt,
    dimensions: [
      { id: "correctness", weight: 3, description: "Finds the bug." },
      { id: "code-quality", weight: 1, description: "Minimal fix." },
    ],
  };

  test("parses per-dimension scores and computes a weighted score", async () => {
    const adapter: ModelAdapter = {
      providerId: "test",
      modelName: "test-judge",
      async call() {
        return {
          text: JSON.stringify({
            score: 4,
            rationale: "Solid overall",
            dimensions: {
              correctness: { score: 5, rationale: "Found the exact bug" },
              "code-quality": { score: 3, rationale: "A bit verbose" },
            },
          }),
          raw: {},
          latencyMs: 1,
        };
      },
    };

    const outcome = await runJudge(adapter, promptWithDimensions, "candidate output");

    expect(outcome.result?.dimensions).toEqual({
      correctness: { score: 5, rationale: "Found the exact bug" },
      "code-quality": { score: 3, rationale: "A bit verbose" },
    });
    // (5*3 + 3*1) / 4 = 4.5
    expect(outcome.result?.weightedScore).toBeCloseTo(4.5);
  });

  test("retries with a corrective message when a required dimension is missing", async () => {
    let calls = 0;
    const adapter: ModelAdapter = {
      providerId: "test",
      modelName: "test-judge",
      async call(input) {
        calls++;
        if (calls === 1) {
          return {
            text: JSON.stringify({
              score: 4,
              rationale: "Missing code-quality dimension",
              dimensions: { correctness: { score: 5, rationale: "Found it" } },
            }),
            raw: {},
            latencyMs: 1,
          };
        }
        expect(input.userPrompt).toContain("code-quality");
        return {
          text: JSON.stringify({
            score: 4,
            rationale: "Fixed",
            dimensions: {
              correctness: { score: 5, rationale: "Found it" },
              "code-quality": { score: 4, rationale: "Fine" },
            },
          }),
          raw: {},
          latencyMs: 1,
        };
      },
    };

    const outcome = await runJudge(adapter, promptWithDimensions, "candidate output");

    expect(calls).toBe(2);
    expect(outcome.result?.dimensions?.["code-quality"]).toEqual({ score: 4, rationale: "Fine" });
  });

  test("gives up after exhausting corrective attempts with a missing dimension", async () => {
    const adapter: ModelAdapter = {
      providerId: "test",
      modelName: "test-judge",
      async call() {
        return {
          text: JSON.stringify({
            score: 4,
            rationale: "Still missing",
            dimensions: { correctness: { score: 5, rationale: "Found it" } },
          }),
          raw: {},
          latencyMs: 1,
        };
      },
    };

    const outcome = await runJudge(adapter, promptWithDimensions, "candidate output");

    expect(outcome.result).toBeNull();
    expect(outcome.error).toBe("judge did not return a valid JSON score after 2 attempts");
  });
});
