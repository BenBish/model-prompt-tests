import { describe, expect, test } from "bun:test";
import type { RubricDimension } from "../types";
import { buildDimensionalCorrectiveMessage, validateDimensionalResult } from "./dimensionalScoring";

const dims: RubricDimension[] = [
  { id: "correctness", weight: 3, description: "Finds the bug." },
  { id: "code-quality", weight: 1, description: "Minimal fix." },
];

describe("validateDimensionalResult", () => {
  test("accepts a holistic-only result when no dimensions are given", () => {
    const validate = validateDimensionalResult(undefined);
    expect(validate({ score: 4, rationale: "solid" })).toEqual({ score: 4, rationale: "solid" });
  });

  test("rejects an out-of-range or non-integer score", () => {
    const validate = validateDimensionalResult(undefined);
    expect(validate({ score: 6, rationale: "x" })).toBeUndefined();
    expect(validate({ score: 3.5, rationale: "x" })).toBeUndefined();
  });

  test("computes a weighted score from per-dimension scores", () => {
    const validate = validateDimensionalResult(dims);
    const result = validate({
      score: 4,
      rationale: "solid",
      dimensions: {
        correctness: { score: 5, rationale: "found it" },
        "code-quality": { score: 3, rationale: "ok" },
      },
    });
    // (5*3 + 3*1) / 4 = 4.5
    expect(result?.weightedScore).toBeCloseTo(4.5);
  });

  test("rejects a result missing a required dimension", () => {
    const validate = validateDimensionalResult(dims);
    expect(
      validate({ score: 4, rationale: "solid", dimensions: { correctness: { score: 5, rationale: "x" } } }),
    ).toBeUndefined();
  });

  test("rejects an invalid per-dimension score", () => {
    const validate = validateDimensionalResult(dims);
    expect(
      validate({
        score: 4,
        rationale: "solid",
        dimensions: {
          correctness: { score: 9, rationale: "x" },
          "code-quality": { score: 3, rationale: "ok" },
        },
      }),
    ).toBeUndefined();
  });
});

describe("buildDimensionalCorrectiveMessage", () => {
  test("mentions the JSON schema when there are no dimensions", () => {
    expect(buildDimensionalCorrectiveMessage(undefined)).toContain("score");
  });

  test("lists every dimension id when dimensions are present", () => {
    const message = buildDimensionalCorrectiveMessage(dims);
    expect(message).toContain("correctness");
    expect(message).toContain("code-quality");
  });
});
