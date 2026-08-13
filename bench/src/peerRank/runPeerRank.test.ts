import { describe, expect, test } from "bun:test";
import type { ModelAdapter } from "../providers/types";
import { runOnePeerRank } from "./runPeerRank";

describe("runOnePeerRank", () => {
  test("returns deanonymized ranking without model ids in the ranker prompt", async () => {
    let seenUserPrompt = "";
    const adapter: ModelAdapter = {
      providerId: "test",
      modelName: "ranker",
      async call(input) {
        seenUserPrompt = input.userPrompt;
        // Rank presentation order: whatever labels appear as Response X
        const labels = [...seenUserPrompt.matchAll(/### Response ([A-Z])/g)].map((m) => m[1]!);
        return {
          text: JSON.stringify({
            ranking: labels,
            rationale: "order as presented",
          }),
          raw: {},
          latencyMs: 1,
          inputTokens: 10,
          outputTokens: 5,
          costUsd: 0.001,
        };
      },
    };

    const result = await runOnePeerRank(
      { adapter, modelId: "model-a", pricing: { inputPerMTok: 1, outputPerMTok: 2 } },
      "What is 2+2?",
      [
        { modelId: "model-a", outputText: "four" },
        { modelId: "model-b", outputText: "4" },
      ],
      () => 0, // stable shuffle (no swaps when random always 0)
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.rankingModelIds).toHaveLength(2);
    expect(new Set(result.rankingModelIds)).toEqual(new Set(["model-a", "model-b"]));
    expect(seenUserPrompt).not.toContain("model-a");
    expect(seenUserPrompt).not.toContain("model-b");
    expect(seenUserPrompt).toContain("Response A");
    expect(seenUserPrompt).toContain("Response B");
    expect(result.costUsd).toBe(0.001);
  });

  test("records error when ranking is invalid after retry", async () => {
    const adapter: ModelAdapter = {
      providerId: "test",
      modelName: "bad",
      async call() {
        return { text: "not json", raw: {}, latencyMs: 1 };
      },
    };

    const result = await runOnePeerRank(
      { adapter, modelId: "r1" },
      "prompt",
      [
        { modelId: "r1", outputText: "a" },
        { modelId: "r2", outputText: "b" },
      ],
    );

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error).toMatch(/valid permutation/);
  });
});
