import { describe, expect, test } from "bun:test";
import { analyzeAnchors, buildBlindedAnchorPayload, calibrationManifestId, loadJson, type AnchorCorpus, type CalibrationEvidence } from "./anchors";

const corpusPath = new URL("../../calibration/anchors-v1.json", import.meta.url).pathname;
const evidencePath = new URL("../../calibration/reference-evidence-v1.json", import.meta.url).pathname;

describe("human anchor calibration", () => {
  test("reference evidence passes the fail-closed publication gate", async () => {
    const corpus = await loadJson<AnchorCorpus>(corpusPath);
    const evidence = await loadJson<CalibrationEvidence>(evidencePath);
    const result = analyzeAnchors(corpus, evidence, new Date("2026-08-24T00:00:00Z"));
    expect(result.status).toBe("calibrated");
    expect(result.publicationEligible).toBe(true);
    expect(result.monotonicityFailures).toEqual([]);
    expect(result.categories).toHaveLength(4);
    expect(result.ties).toBe(2);
    expect(result.positionEffect).toBe(0);
  });

  test("distinguishes uncalibrated, stale, and failed", async () => {
    const corpus = await loadJson<AnchorCorpus>(corpusPath);
    const evidence = await loadJson<CalibrationEvidence>(evidencePath);
    expect(analyzeAnchors(corpus, undefined).status).toBe("uncalibrated");
    expect(analyzeAnchors(corpus, evidence, new Date("2027-01-01T00:00:00Z")).status).toBe("stale");
    const failed = structuredClone(evidence);
    failed.judgments = failed.judgments.map((j) => ({ ...j, score: 5 as const }));
    expect(analyzeAnchors(corpus, failed, new Date("2026-08-24T00:00:00Z")).status).toBe("failed");
  });

  test("rejects a corpus without every 1/3/5 category anchor", async () => {
    const corpus = await loadJson<AnchorCorpus>(corpusPath);
    corpus.anchors = corpus.anchors.filter((a) => a.id !== "review-5");
    expect(() => analyzeAnchors(corpus, undefined)).toThrow("missing code-review quality-5 anchor");
  });

  test("builds a judge-safe payload without answer-key fields", async () => {
    const corpus = await loadJson<AnchorCorpus>(corpusPath);
    const payload = buildBlindedAnchorPayload(corpus, "run-1");
    expect(payload.anchors).toHaveLength(12);
    expect(JSON.stringify(payload.anchors)).not.toContain("quality");
    expect(JSON.stringify(payload.anchors)).not.toContain("taskId");
    expect(Object.keys(payload.answerKey)).toEqual(payload.anchors.map((a) => a.label));
  });

  test("fails closed on forged provenance, duplicate coverage, and missing answer order", async () => {
    const corpus = await loadJson<AnchorCorpus>(corpusPath);
    const evidence = await loadJson<CalibrationEvidence>(evidencePath);
    expect(evidence.experimentId).toBe(calibrationManifestId(evidence.manifest));
    const forged = structuredClone(evidence); forged.manifest.rubricSha256 = "c".repeat(64);
    expect(analyzeAnchors(corpus, forged, new Date("2026-08-24T00:00:00Z")).status).toBe("failed");
    const duplicate = structuredClone(evidence); duplicate.humanLabels[1] = duplicate.humanLabels[0]!;
    expect(() => analyzeAnchors(corpus, duplicate)).toThrow("must be unique");
    const oneOrder = structuredClone(evidence); oneOrder.pairwise.splice(1, 1);
    expect(analyzeAnchors(corpus, oneOrder, new Date("2026-08-24T00:00:00Z")).status).toBe("failed");
  });
});
