import { describe, expect, test } from "bun:test";
import {
  buildSynthesisUserPrompt,
  validateSynthesisResult,
} from "./buildPrompt";

describe("validateSynthesisResult", () => {
  test("accepts a valid answer and filters unknown model ids", () => {
    const result = validateSynthesisResult(
      {
        answer: "  Combined.  ",
        provenance: { usedModelIds: ["a", "ghost"], notes: " used a " },
      },
      ["a", "b"],
    );
    expect(result).toEqual({
      answer: "Combined.",
      usedModelIds: ["a"],
      notes: "used a",
    });
  });

  test("rejects empty answer or missing provenance", () => {
    expect(validateSynthesisResult({ answer: "", provenance: { usedModelIds: [], notes: "" } }, [])).toBeUndefined();
    expect(validateSynthesisResult({ answer: "ok" }, ["a"])).toBeUndefined();
    expect(validateSynthesisResult({ answer: "ok", provenance: { usedModelIds: "a", notes: "" } }, ["a"])).toBeUndefined();
  });
});

describe("buildSynthesisUserPrompt", () => {
  test("includes model ids and optional rank hint", () => {
    const text = buildSynthesisUserPrompt(
      "Do the thing",
      [
        { modelId: "m:a", outputText: "A" },
        { modelId: "m:b", outputText: "B" },
      ],
      ["m:b", "m:a"],
    );
    expect(text).toContain("Do the thing");
    expect(text).toContain("Candidate `m:a`");
    expect(text).toContain("Peer ranking");
    expect(text).toContain("`m:b`");
  });
});
