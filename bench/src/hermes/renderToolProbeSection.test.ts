import { describe, expect, test } from "bun:test";
import { renderToolProbeSection } from "./renderToolProbeSection";
import type { ToolProbeCandidateSummary } from "./runToolProbe";

describe("renderToolProbeSection", () => {
  test("returns an empty string for no summaries", () => {
    expect(renderToolProbeSection([])).toBe("");
  });

  test("renders a markdown table with percentages and latency", () => {
    const summaries: ToolProbeCandidateSummary[] = [
      {
        modelId: "local:hermes-qwen36-27b",
        cases: 10,
        errors: 1,
        wellFormedRate: 0.9,
        correctToolRate: 0.8,
        validArgsRate: 0.7,
        avgLatencyMs: 1234,
      },
    ];
    const md = renderToolProbeSection(summaries);
    expect(md).toContain("## Hermes Tool Probe");
    expect(md).toContain("`local:hermes-qwen36-27b`");
    expect(md).toContain("90%");
    expect(md).toContain("80%");
    expect(md).toContain("70%");
    expect(md).toContain("1234");
  });

  test("renders an em dash when latency is unavailable", () => {
    const summaries: ToolProbeCandidateSummary[] = [
      { modelId: "m", cases: 1, errors: 1, wellFormedRate: 0, correctToolRate: 0, validArgsRate: 0 },
    ];
    expect(renderToolProbeSection(summaries)).toContain("| — |");
  });
});
