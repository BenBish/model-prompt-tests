import { describe, expect, test } from "bun:test";
import { evaluateRegressionPolicy, type RegressionPolicy } from "./policy";

const policy: RegressionPolicy = {
  minimumCorrectness: 0.8, maximumErrorRate: 0.05, maximumTimeoutRate: 0.02,
  maximumCostUsd: 10, maximumMedianLatencyMs: 5_000, minimumCoverage: 0.95,
  minimumPairedSamples: 20, maximumPairedRegression: 0.05, requireHealthyGraders: true,
};
const healthy = {
  experimentId: "exp_candidate", baselineExperimentId: "exp_baseline", correctness: 0.9,
  errorRate: 0, timeoutRate: 0, costUsd: 4, medianLatencyMs: 1_000, coverage: 1,
  pairedSamples: 30, pairedDelta: 0.02, pairedConfidenceLow: -0.01, pairedConfidenceHigh: 0.05, graderHealth: "healthy" as const,
};

describe("evaluateRegressionPolicy", () => {
  test("passes complete evidence inside every threshold", () => {
    expect(evaluateRegressionPolicy(policy, healthy).verdict).toBe("pass");
  });
  test("flags a statistically supported regression", () => {
    const result = evaluateRegressionPolicy(policy, { ...healthy, pairedDelta: -0.12, pairedConfidenceLow: -0.16, pairedConfidenceHigh: -0.08 });
    expect(result.verdict).toBe("regression");
    expect(result.findings.find((finding) => finding.gate === "paired-delta")?.status).toBe("fail");
  });
  test("does not call a wide confidence interval a supported regression", () => {
    expect(evaluateRegressionPolicy(policy, { ...healthy, pairedDelta: -0.12, pairedConfidenceLow: -0.2, pairedConfidenceHigh: 0.2 }).verdict).toBe("pass");
  });
  test("fails closed when evidence is missing", () => {
    expect(evaluateRegressionPolicy(policy, { ...healthy, experimentId: undefined, graderHealth: "missing", coverage: undefined }).verdict).toBe("inconclusive");
  });
});
