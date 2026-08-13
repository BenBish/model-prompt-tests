import { describe, expect, test } from "bun:test";
import { validatePeerRankResult } from "./validateRanking";

describe("validatePeerRankResult", () => {
  const labels = ["A", "B", "C"];

  test("accepts a full permutation with rationale", () => {
    expect(
      validatePeerRankResult({ ranking: ["B", "A", "C"], rationale: "B is best" }, labels),
    ).toEqual({ ranking: ["B", "A", "C"], rationale: "B is best" });
  });

  test("rejects missing label, duplicate, extra, or empty rationale", () => {
    expect(validatePeerRankResult({ ranking: ["A", "B"], rationale: "x" }, labels)).toBeUndefined();
    expect(
      validatePeerRankResult({ ranking: ["A", "A", "B"], rationale: "x" }, labels),
    ).toBeUndefined();
    expect(
      validatePeerRankResult({ ranking: ["A", "B", "D"], rationale: "x" }, labels),
    ).toBeUndefined();
    expect(
      validatePeerRankResult({ ranking: ["A", "B", "C"], rationale: "  " }, labels),
    ).toBeUndefined();
  });
});
