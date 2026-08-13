import { describe, expect, test } from "bun:test";
import { aggregateRankings } from "./aggregate";

describe("aggregateRankings", () => {
  test("returns empty for no rankings", () => {
    expect(aggregateRankings([])).toEqual([]);
  });

  test("sums Borda points (best gets n points)", () => {
    // Two rankers, 3 models: best=3, mid=2, worst=1
    const rankings = [
      ["a", "b", "c"],
      ["a", "c", "b"],
    ];
    const result = aggregateRankings(rankings);
    expect(result[0]).toMatchObject({ modelId: "a", bordaScore: 6, timesRanked: 2 });
    // c: ranks 3 then 2 → Borda 1+2=3; b: ranks 2 then 3 → Borda 2+1=3 — tie on Borda and avg rank
    // so model id localeCompare: b before c
    expect(result.map((r) => r.modelId)).toEqual(["a", "b", "c"]);
    expect(result.find((r) => r.modelId === "c")!.bordaScore).toBe(3);
    expect(result.find((r) => r.modelId === "b")!.bordaScore).toBe(3);
  });

  test("computes average 1-based rank", () => {
    const rankings = [
      ["x", "y"],
      ["y", "x"],
    ];
    const result = aggregateRankings(rankings);
    // Both Borda = 3; average rank both 1.5; model id tie-break
    expect(result[0]!.averageRank).toBe(1.5);
    expect(result[1]!.averageRank).toBe(1.5);
  });

  test("prefer higher Borda over lower average rank conflict", () => {
    const rankings = [
      ["winner", "loser"],
      ["winner", "loser"],
    ];
    const result = aggregateRankings(rankings);
    expect(result[0]!.modelId).toBe("winner");
    expect(result[0]!.bordaScore).toBe(4);
    expect(result[1]!.modelId).toBe("loser");
    expect(result[1]!.bordaScore).toBe(2);
  });
});
