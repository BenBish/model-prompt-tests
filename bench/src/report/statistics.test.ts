import { describe, expect, test } from "bun:test";
import { analyzePairedBatchTransitions, analyzePairedPreferences, analyzePairedTrials, hierarchicalBootstrapDelta, wilsonInterval, type StatisticalTrial } from "./statistics";

const trial = (taskId: string, modelId: string, outcome: 0 | 1, repeatIndex = 0, extra: Partial<StatisticalTrial> = {}): StatisticalTrial =>
  ({ taskId, modelId, outcome, repeatIndex, ...extra });

describe("paired statistical analysis", () => {
  test("reports Wilson uncertainty for binary rates", () => {
    expect(wilsonInterval(5, 10)).toMatchObject({ confidence: 0.95 });
    expect(wilsonInterval(5, 10)!.low).toBeCloseTo(0.237, 2);
    expect(wilsonInterval(5, 10)!.high).toBeCloseTo(0.763, 2);
    expect(() => wilsonInterval(5, 10, 0.9)).toThrow("confidence=0.95");
  });

  test("computes wins, losses, ties only on matched tasks and exposes missingness", () => {
    const rows = [
      trial("win", "a", 0), trial("win", "b", 1),
      trial("loss", "a", 1), trial("loss", "b", 0),
      trial("tie", "a", 1), trial("tie", "b", 1),
      trial("missing", "a", 1),
    ];
    const analysis = analyzePairedTrials(rows, { minimumMatchedTasks: 1, minimumCoverage: 0.5, bootstrapSamples: 200 });
    expect(analysis.comparisons[0]).toMatchObject({ matchedTasks: 3, unionTasks: 4, wins: 1, losses: 1, ties: 1, verdict: "inconclusive" });
    expect(analysis.rates.find((rate) => rate.modelId === "b")?.missingTasks).toBe(1);
  });

  test("keeps candidate failures in ITT and separates infrastructure failures", () => {
    const rows = [
      trial("one", "a", 0, 0),
      trial("two", "a", 0, 0, { infrastructureFailure: true }),
      trial("one", "b", 1, 0),
    ];
    const analysis = analyzePairedTrials(rows, { bootstrapSamples: 100 });
    expect(analysis.rates.find((rate) => rate.modelId === "a")).toMatchObject({ trials: 1, successes: 0, infrastructureFailures: 1 });
  });

  test("hierarchical bootstrap resamples repeats within tasks", () => {
    const interval = hierarchicalBootstrapDelta([
      { baseline: [0, 0], candidate: [1, 1] },
      { baseline: [0, 1], candidate: [1, 1] },
    ], 500);
    expect(interval.low).toBeGreaterThanOrEqual(0);
    expect(interval.high).toBeLessThanOrEqual(1);
  });

  test("declares a practical win only when powered and beyond equivalence", () => {
    const rows: StatisticalTrial[] = [];
    for (let i = 0; i < 8; i++) { rows.push(trial(`task-${i}`, "a", 0), trial(`task-${i}`, "b", 1)); }
    const comparison = analyzePairedTrials(rows, { bootstrapSamples: 300 }).comparisons[0]!;
    expect(comparison.verdict).toBe("win");
    expect(comparison.interval.low).toBeGreaterThan(0.02);
  });

  test("warns for underpowered, ceiling-concentrated, and unstable evidence", () => {
    const rows = [trial("one", "a", 1), trial("one", "b", 1), trial("two", "a", 1), trial("two", "b", 0)];
    const analysis = analyzePairedTrials(rows, { bootstrapSamples: 200 });
    expect(analysis.comparisons[0]?.verdict).toBe("inconclusive");
    expect(analysis.warnings.some((warning) => warning.includes("low sample size"))).toBe(true);
    expect(analysis.warnings.some((warning) => warning.includes("ceiling"))).toBe(true);
  });

  test("marks cross-domain quality evidence exploratory", () => {
    const rows = [trial("one", "a", 0, 0, { environmentFingerprint: "laptop" }), trial("one", "b", 1, 0, { environmentFingerprint: "fedora" })];
    expect(analyzePairedTrials(rows, { bootstrapSamples: 100 }).comparisons[0]).toMatchObject({ exploratory: true, verdict: "inconclusive" });
  });

  test("reports explicit paired preference wins, ties, and swap metadata coverage", () => {
    expect(analyzePairedPreferences([
      { taskId: "one", preferred: "candidate", positionSwapped: true },
      { taskId: "two", preferred: "baseline", positionSwapped: false },
      { taskId: "three", preferred: "tie" },
    ])).toEqual({ observations: 3, candidateWins: 1, baselineWins: 1, ties: 1,
      candidateWinRateExcludingTies: 0.5, tieRate: 1 / 3, positionSwapCoverage: 2 / 3 });
  });

  test("suppresses verdicts when experiment provenance is not proven compatible", () => {
    const rows: StatisticalTrial[] = [];
    for (let i = 0; i < 8; i++) {
      rows.push(trial(`task-${i}`, "a", 0, 0, { provenanceId: "experiment-a" }));
      rows.push(trial(`task-${i}`, "b", 1, 0, { provenanceId: "experiment-b" }));
    }
    const comparison = analyzePairedTrials(rows, { bootstrapSamples: 200 }).comparisons[0]!;
    expect(comparison.verdict).toBe("inconclusive");
    expect(comparison.warnings.some((warning) => warning.includes("provenance"))).toBe(true);
  });

  test("rank stability uses only tasks covered by every model", () => {
    const analysis = analyzePairedTrials([
      trial("common", "a", 1), trial("common", "b", 0), trial("missing-b", "a", 1),
    ], { bootstrapSamples: 100 });
    expect(analysis.warnings).toContain("rank stability uses 1/2 tasks with complete model coverage");
  });

  test("builds true same-model before/after batch comparisons", () => {
    const before = Array.from({ length: 8 }, (_, i) => trial(`task-${i}`, "model", 0));
    const after = Array.from({ length: 8 }, (_, i) => trial(`task-${i}`, "model", 1));
    const comparison = analyzePairedBatchTransitions(before, after, true, { bootstrapSamples: 200 }).comparisons[0]!;
    expect(comparison).toMatchObject({ baselineId: "model (before)", candidateId: "model (after)", verdict: "win" });
    expect(analyzePairedBatchTransitions(before, after, false, { bootstrapSamples: 100 }).comparisons[0]?.verdict).toBe("inconclusive");
  });
});
