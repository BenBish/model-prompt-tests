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

  test("falls back to plain JSON when the provider rejects json_schema", async () => {
    let sawSchema = false;
    let sawPlain = false;
    const adapter: ModelAdapter = {
      providerId: "p",
      modelName: "chair",
      async call(input) {
        if (input.jsonSchema) {
          sawSchema = true;
          const err = new Error("response_format json_schema unavailable") as Error & { status?: number };
          err.status = 400;
          throw err;
        }
        sawPlain = true;
        return {
          text: JSON.stringify({
            answer: "Combined",
            provenance: { usedModelIds: ["m:a"], notes: "plain fallback" },
          }),
          raw: {},
          latencyMs: 2,
        };
      },
    };

    const result = await runOneSynthesis(
      { adapter, modelId: "chair" },
      "Task",
      [
        { modelId: "m:a", outputText: "A" },
        { modelId: "m:b", outputText: "B" },
      ],
    );

    expect(sawSchema).toBe(true);
    expect(sawPlain).toBe(true);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.synthesisText).toBe("Combined");
    expect(result.notes).toBe("plain fallback");
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
