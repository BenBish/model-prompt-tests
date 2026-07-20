import { expect, test } from "bun:test";
import type { ModelSummary } from "./queryData";
import { renderCompareHtml } from "./renderCompareHtml";

function summary(modelId: string, avgScore: number | undefined): ModelSummary {
  return { modelId, okRuns: 5, errorRuns: 0, missingJudgeScores: 0, avgScore, truncatedRuns: 0 };
}

test("renders a delta table and highlights the biggest mover", () => {
  const before = [summary("model-a", 3.5), summary("model-b", 4.0)];
  const after = [summary("model-a", 4.5), summary("model-b", 4.1)];

  const html = renderCompareHtml("batch-before", before, "batch-after", after, "2026-07-14T00:00:00.000Z");

  expect(html).toContain("model-a");
  expect(html).toContain("model-b");
  expect(html).toContain("+1.00"); // model-a's improvement, the biggest move
  expect(html).toContain("batch-before");
  expect(html).toContain("batch-after");
});

test("handles a model present in only one batch", () => {
  const before = [summary("model-a", 3.5)];
  const after = [summary("model-a", 4.0), summary("model-c", 4.2)];

  const html = renderCompareHtml("before", before, "after", after, "2026-07-14T00:00:00.000Z");

  expect(html).toContain("model-c");
  expect(html).toContain("<!doctype html>");
});
