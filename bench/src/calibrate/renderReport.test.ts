import { describe, expect, test } from "bun:test";
import { SIDE_SIGNAL_RECOMMENDATION, type CalibrationResult } from "./compare";
import { renderCalibrationMarkdown } from "./renderReport";

const empty: CalibrationResult = {
  generatedAt: "2026-08-13T00:00:00.000Z",
  allRuns: false,
  groups: [],
  skippedGroups: 0,
  humanLabelCount: 0,
  recommendation: SIDE_SIGNAL_RECOMMENDATION,
};

describe("renderCalibrationMarkdown", () => {
  test("always states the side-signal recommendation and command sequence", () => {
    const md = renderCalibrationMarkdown(empty);
    expect(md).toContain("Keep peer ranks as a side signal only");
    expect(md).toContain("bun run bench run calibration");
    expect(md).toContain("--peer-rank");
    expect(md).toContain("instruction-following/five-bullet-summary");
    expect(md).toContain("No comparable groups");
    expect(md).toContain("Headline `avgScore` is never rewritten");
  });

  test("lists inversions for a disagreeing group", () => {
    const md = renderCalibrationMarkdown({
      ...empty,
      runBatchId: "batch-1",
      groups: [
        {
          promptId: "debugging/javascript-debounce",
          repeatIndex: 0,
          models: [
            { modelId: "m:a", peerAverageRank: 1, judgeMedian: 1 },
            { modelId: "m:b", peerAverageRank: 2, judgeMedian: 5 },
          ],
          inversionsPeerVsJudge: 1,
          comparablePairsPeerVsJudge: 1,
          inversionsPeerVsHuman: 0,
          comparablePairsPeerVsHuman: 0,
          inversionsJudgeVsHuman: 0,
          comparablePairsJudgeVsHuman: 0,
          spearmanPeerVsJudge: -1,
        },
      ],
      meanSpearmanPeerVsJudge: -1,
      inversionRatePeerVsJudge: 1,
    });
    expect(md).toContain("`m:a` ranked above `m:b` by peers");
    expect(md).toContain("multi-judge median prefers `m:b`");
    expect(md).toContain("batch-1");
  });
});
