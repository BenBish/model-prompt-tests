import { describe, expect, test } from "bun:test";
import { humanRanksForGroup, parseHumanLabels } from "./humanLabels";

describe("parseHumanLabels", () => {
  test("accepts ranking or scores per group", () => {
    const map = parseHumanLabels(
      {
        groups: [
          { promptId: "a/p", ranking: ["m1", "m2"] },
          { promptId: "b/p", repeatIndex: 1, scores: { m1: 4, m2: 4, m3: 2 } },
        ],
      },
      "labels.json",
    );
    expect(map.size).toBe(2);
    expect(map.get("a/p\0" + 0)?.ranking).toEqual(["m1", "m2"]);
    expect(map.get("b/p\0" + 1)?.scores).toEqual({ m1: 4, m2: 4, m3: 2 });
  });

  test("rejects missing groups, duplicates, and empty entries", () => {
    expect(() => parseHumanLabels({}, "x.json")).toThrow(/missing "groups"/);
    expect(() =>
      parseHumanLabels(
        { groups: [{ promptId: "p", ranking: ["a"] }, { promptId: "p", ranking: ["b"] }] },
        "x.json",
      ),
    ).toThrow(/duplicate group/);
    expect(() => parseHumanLabels({ groups: [{ promptId: "p" }] }, "x.json")).toThrow(/ranking/);
  });
});

describe("humanRanksForGroup", () => {
  test("ranking is 1-based best-first", () => {
    const ranks = humanRanksForGroup({ promptId: "p", repeatIndex: 0, ranking: ["a", "b", "c"] });
    expect(ranks.get("a")).toBe(1);
    expect(ranks.get("c")).toBe(3);
  });

  test("scores convert to midranks (higher better)", () => {
    const ranks = humanRanksForGroup({
      promptId: "p",
      repeatIndex: 0,
      scores: { a: 5, b: 5, c: 2 },
    });
    expect(ranks.get("a")).toBe(1.5);
    expect(ranks.get("b")).toBe(1.5);
    expect(ranks.get("c")).toBe(3);
  });

  test("ranking wins when both are present", () => {
    const ranks = humanRanksForGroup({
      promptId: "p",
      repeatIndex: 0,
      ranking: ["c", "a"],
      scores: { a: 5, c: 1 },
    });
    expect(ranks.get("c")).toBe(1);
    expect(ranks.get("a")).toBe(2);
  });
});
