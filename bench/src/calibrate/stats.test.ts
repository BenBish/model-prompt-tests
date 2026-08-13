import { describe, expect, test } from "bun:test";
import { kendallTauB, midranks, pairwiseInversions, pearson, spearman } from "./stats";

describe("midranks", () => {
  test("assigns 1..n when values are unique (higher is better)", () => {
    expect(midranks([3, 9, 1], "higher")).toEqual([2, 1, 3]);
  });

  test("splits ties with average ranks", () => {
    expect(midranks([5, 5, 3], "higher")).toEqual([1.5, 1.5, 3]);
  });

  test("lower-is-better ranks smaller values first", () => {
    expect(midranks([1.0, 2.5, 2.0], "lower")).toEqual([1, 3, 2]);
  });
});

describe("pearson / spearman / kendall", () => {
  test("undefined for n < 2", () => {
    expect(pearson([1], [2])).toBeUndefined();
    expect(spearman([1], [2])).toBeUndefined();
    expect(kendallTauB([1], [2])).toBeUndefined();
  });

  test("perfect agreement is +1", () => {
    // peer avg ranks 1,2,3 and judge scores 5,3,1 → same order
    expect(spearman([1, 2, 3], [5, 3, 1], { xBetter: "lower", yBetter: "higher" })).toBeCloseTo(1);
    expect(kendallTauB([1, 2, 3], [-5, -3, -1])).toBeCloseTo(1);
  });

  test("full reversal is -1", () => {
    expect(spearman([1, 2, 3], [1, 3, 5], { xBetter: "lower", yBetter: "higher" })).toBeCloseTo(-1);
    expect(kendallTauB([1, 2, 3], [1, 3, 5])).toBeCloseTo(1);
    expect(kendallTauB([1, 2, 3], [5, 3, 1])).toBeCloseTo(-1);
  });

  test("constant series is undefined", () => {
    expect(spearman([1, 1, 1], [5, 3, 1], { xBetter: "lower", yBetter: "higher" })).toBeUndefined();
    expect(kendallTauB([2, 2, 2], [1, 2, 3])).toBeUndefined();
  });
});

describe("pairwiseInversions", () => {
  test("counts strict disagreements only", () => {
    const peer = [1, 2, 3]; // a > b > c
    const judge = [5, 4, 2]; // same
    expect(pairwiseInversions(peer, judge, { xBetter: "lower", yBetter: "higher" })).toEqual({
      inversions: 0,
      comparablePairs: 3,
    });
  });

  test("one inverted pair among three models", () => {
    // a best by peers, c best by judges; b middle both
    const peer = [1, 2, 3]; // a, b, c
    const judge = [3, 4, 5]; // c > b > a  → all 3 pairs invert
    expect(pairwiseInversions(peer, judge, { xBetter: "lower", yBetter: "higher" })).toEqual({
      inversions: 3,
      comparablePairs: 3,
    });
  });

  test("ignores ties on either side", () => {
    const peer = [1, 1, 3];
    const judge = [5, 4, 4];
    // pairs: (0,1) peer tied; (0,2) peer 0 better, judge 0 better; (1,2) peer 1 better, judge tied
    expect(pairwiseInversions(peer, judge, { xBetter: "lower", yBetter: "higher" })).toEqual({
      inversions: 0,
      comparablePairs: 1,
    });
  });
});
