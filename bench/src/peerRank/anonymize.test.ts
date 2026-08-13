import { describe, expect, test } from "bun:test";
import { anonymizePeers, deanonymizeRanking, labelForIndex } from "./anonymize";

describe("labelForIndex", () => {
  test("maps 0..25 to A..Z", () => {
    expect(labelForIndex(0)).toBe("A");
    expect(labelForIndex(1)).toBe("B");
    expect(labelForIndex(25)).toBe("Z");
  });

  test("rejects out of range", () => {
    expect(() => labelForIndex(-1)).toThrow();
    expect(() => labelForIndex(26)).toThrow();
  });
});

describe("anonymizePeers", () => {
  test("assigns labels A.. and builds invertible mapping", () => {
    const candidates = [
      { modelId: "model-x", outputText: "answer x" },
      { modelId: "model-y", outputText: "answer y" },
      { modelId: "model-z", outputText: "answer z" },
    ];
    // Deterministic reverse order
    let i = 0;
    const sequence = [0.99, 0.99, 0.99];
    const random = () => sequence[i++] ?? 0;

    const { peers, labelToModelId } = anonymizePeers(candidates, random);

    expect(peers).toHaveLength(3);
    expect(peers.map((p) => p.label)).toEqual(["A", "B", "C"]);
    expect(new Set(peers.map((p) => p.modelId))).toEqual(
      new Set(["model-x", "model-y", "model-z"]),
    );
    for (const peer of peers) {
      expect(labelToModelId[peer.label]).toBe(peer.modelId);
      expect(peer.outputText).toContain("answer");
    }
  });

  test("never includes model ids in peer labels", () => {
    const { peers } = anonymizePeers([
      { modelId: "anthropic:sonnet", outputText: "a" },
      { modelId: "openai:gpt", outputText: "b" },
    ]);
    for (const peer of peers) {
      expect(peer.label).toMatch(/^[A-Z]$/);
      expect(peer.label).not.toContain(":");
    }
  });

  test("requires at least two candidates", () => {
    expect(() => anonymizePeers([{ modelId: "only", outputText: "x" }])).toThrow(/at least 2/);
  });
});

describe("deanonymizeRanking", () => {
  test("maps labels to model ids best-first", () => {
    const mapping = { A: "m1", B: "m2", C: "m3" };
    expect(deanonymizeRanking(["B", "C", "A"], mapping)).toEqual(["m2", "m3", "m1"]);
  });

  test("throws on unknown label", () => {
    expect(() => deanonymizeRanking(["Z"], { A: "m1" })).toThrow(/unknown ranking label/);
  });
});
