import { describe, expect, test } from "bun:test";
import {
  computeReviewMetrics,
  parseFindingsJson,
  type GroundTruthFinding,
  type ReviewMatcherResult,
} from "./findings";

const groundTruth: GroundTruthFinding[] = [
  { id: "a", severity: "high", summary: "A" },
  { id: "b", severity: "med", summary: "B" },
  { id: "c", severity: "low", summary: "C" },
];

describe("parseFindingsJson", () => {
  test("accepts a valid findings file", () => {
    const spec = parseFindingsJson(
      {
        findings: [
          { id: "x", severity: "high", summary: "bug", matchHints: ["x"] },
        ],
        redHerrings: [{ summary: "noise" }],
      },
      "test.json",
    );
    expect(spec.findings).toHaveLength(1);
    expect(spec.redHerrings).toHaveLength(1);
  });

  test("rejects duplicate ids and bad severity", () => {
    expect(() =>
      parseFindingsJson(
        {
          findings: [
            { id: "x", severity: "high", summary: "a" },
            { id: "x", severity: "low", summary: "b" },
          ],
        },
        "t.json",
      ),
    ).toThrow(/duplicate/);
    expect(() =>
      parseFindingsJson({ findings: [{ id: "x", severity: "urgent", summary: "a" }] }, "t.json"),
    ).toThrow(/severity/);
  });
});

describe("computeReviewMetrics", () => {
  test("perfect match: recall/precision/F1 = 1", () => {
    const matcher: ReviewMatcherResult = {
      matches: [
        { findingId: "a", matched: true },
        { findingId: "b", matched: true },
        { findingId: "c", matched: true },
      ],
      extraFindings: [],
    };
    const m = computeReviewMetrics(groundTruth, matcher);
    expect(m.recall).toBe(1);
    expect(m.precision).toBe(1);
    expect(m.f1).toBe(1);
    expect(m.truePositives).toBe(3);
    expect(m.falseNegatives).toBe(0);
    expect(m.falsePositives).toBe(0);
  });

  test("severity-weighted recall: only high matched → 3/6", () => {
    const matcher: ReviewMatcherResult = {
      matches: [
        { findingId: "a", matched: true },
        { findingId: "b", matched: false },
        { findingId: "c", matched: false },
      ],
      extraFindings: [],
    };
    const m = computeReviewMetrics(groundTruth, matcher);
    expect(m.totalWeight).toBe(6);
    expect(m.matchedWeight).toBe(3);
    expect(m.recall).toBe(0.5);
    expect(m.precision).toBe(1);
    expect(m.findingIdsMissed).toEqual(["b", "c"]);
  });

  test("plausible extras count as false positives; incorrect extras do not", () => {
    const matcher: ReviewMatcherResult = {
      matches: [
        { findingId: "a", matched: true },
        { findingId: "b", matched: true },
        { findingId: "c", matched: true },
      ],
      extraFindings: [
        { summary: "real extra", verdict: "plausible" },
        { summary: "noise", verdict: "incorrect" },
      ],
    };
    const m = computeReviewMetrics(groundTruth, matcher);
    expect(m.falsePositives).toBe(1);
    expect(m.precision).toBe(3 / 4);
  });
});
