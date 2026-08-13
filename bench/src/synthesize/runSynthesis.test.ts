import { describe, expect, test } from "bun:test";
import type { ModelAdapter } from "../providers/types";
import { runOneSynthesis } from "./runSynthesis";

function adapter(text: string): ModelAdapter {
  return {
    providerId: "p",
    modelName: "chair",
    async call() {
      return { text, raw: {}, latencyMs: 3, inputTokens: 10, outputTokens: 5, costUsd: 0.01 };
    },
  };
}

describe("runOneSynthesis", () => {
  test("returns deanonymized-style provenance with model ids", async () => {
    const result = await runOneSynthesis(
      { adapter: adapter(JSON.stringify({ answer: "Best", provenance: { usedModelIds: ["m:a"], notes: "a is clearer" } })), modelId: "chair" },
      "Task",
      [
        { modelId: "m:a", outputText: "A" },
        { modelId: "m:b", outputText: "B" },
      ],
      ["m:a", "m:b"],
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.synthesisText).toBe("Best");
    expect(result.usedModelIds).toEqual(["m:a"]);
    expect(result.costUsd).toBe(0.01);
    expect(result.peerRankOrder).toEqual(["m:a", "m:b"]);
  });

  test("errors when JSON is invalid after retry", async () => {
    const result = await runOneSynthesis(
      { adapter: adapter("not json"), modelId: "chair" },
      "Task",
      [
        { modelId: "m:a", outputText: "A" },
        { modelId: "m:b", outputText: "B" },
      ],
    );
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error).toContain("valid synthesis");
  });
});
