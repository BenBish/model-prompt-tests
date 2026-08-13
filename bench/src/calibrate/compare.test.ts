import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { insertRun } from "../db/runsRepo";
import { insertScore } from "../db/scoresRepo";
import { insertPeerRank } from "../db/peerRanksRepo";
import { SIDE_SIGNAL_RECOMMENDATION, calibrateFromDb } from "./compare";
import { parseHumanLabels } from "./humanLabels";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  return db;
}

function seedCell(
  db: Database,
  opts: {
    batch: string;
    promptId: string;
    modelId: string;
    scores: Array<{ judge: string; score: number }>;
    ranking?: string[];
    ranker?: string;
    repeatIndex?: number;
  },
): void {
  const repeatIndex = opts.repeatIndex ?? 0;
  const runId = insertRun(db, {
    runBatchId: opts.batch,
    promptId: opts.promptId,
    providerId: "test",
    modelId: opts.modelId,
    modelName: opts.modelId.split(":")[1] ?? opts.modelId,
    startedAt: "2026-08-13T00:00:00.000Z",
    status: "ok",
    repeatIndex,
    outputText: `${opts.modelId} answer`,
  });
  for (const score of opts.scores) {
    insertScore(db, {
      runId,
      judgeModelId: score.judge,
      score: score.score,
      rationale: "ok",
      scoredAt: "2026-08-13T00:00:01.000Z",
      status: "ok",
    });
  }
  if (opts.ranking) {
    insertPeerRank(db, {
      runBatchId: opts.batch,
      promptId: opts.promptId,
      repeatIndex,
      rankerModelId: opts.ranker ?? "ranker",
      labelMapping: JSON.stringify({ A: opts.ranking[0], B: opts.ranking[1], C: opts.ranking[2] }),
      rankingLabels: JSON.stringify(["A", "B", "C"].slice(0, opts.ranking.length)),
      rankingModelIds: JSON.stringify(opts.ranking),
      status: "ok",
      rankedAt: "2026-08-13T00:00:02.000Z",
    });
  }
}

describe("comparePeerRanksToJudges", () => {
  test("perfect agreement yields Spearman 1 and no inversions", () => {
    const db = createDb();
    const promptId = "debugging/javascript-debounce";
    const ranking = ["m:a", "m:b", "m:c"];
    seedCell(db, {
      batch: "b1",
      promptId,
      modelId: "m:a",
      scores: [
        { judge: "j:1", score: 5 },
        { judge: "j:2", score: 5 },
      ],
      ranking,
      ranker: "m:a",
    });
    seedCell(db, {
      batch: "b1",
      promptId,
      modelId: "m:b",
      scores: [
        { judge: "j:1", score: 3 },
        { judge: "j:2", score: 4 },
      ],
      ranking,
      ranker: "m:b",
    });
    seedCell(db, {
      batch: "b1",
      promptId,
      modelId: "m:c",
      scores: [
        { judge: "j:1", score: 2 },
        { judge: "j:2", score: 1 },
      ],
      ranking,
      ranker: "m:c",
    });

    const result = calibrateFromDb(db, { runBatchId: "b1" });
    expect(result.recommendation).toBe(SIDE_SIGNAL_RECOMMENDATION);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.spearmanPeerVsJudge).toBeCloseTo(1);
    expect(result.groups[0]!.inversionsPeerVsJudge).toBe(0);
    expect(result.meanSpearmanPeerVsJudge).toBeCloseTo(1);
    expect(result.inversionRatePeerVsJudge).toBe(0);
  });

  test("reversed ranks vs judges yield Spearman -1", () => {
    const db = createDb();
    const promptId = "p";
    const ranking = ["m:a", "m:b", "m:c"];
    seedCell(db, {
      batch: "b1",
      promptId,
      modelId: "m:a",
      scores: [{ judge: "j:1", score: 1 }],
      ranking,
      ranker: "m:a",
    });
    seedCell(db, {
      batch: "b1",
      promptId,
      modelId: "m:b",
      scores: [{ judge: "j:1", score: 3 }],
      ranking,
      ranker: "m:b",
    });
    seedCell(db, {
      batch: "b1",
      promptId,
      modelId: "m:c",
      scores: [{ judge: "j:1", score: 5 }],
      ranking,
      ranker: "m:c",
    });

    const result = calibrateFromDb(db, { runBatchId: "b1" });
    expect(result.groups[0]!.spearmanPeerVsJudge).toBeCloseTo(-1);
    expect(result.groups[0]!.inversionsPeerVsJudge).toBe(3);
    expect(result.inversionRatePeerVsJudge).toBe(1);
  });

  test("excludes self-judge scores from the judge median", () => {
    const db = createDb();
    const promptId = "p";
    // m:a self-scores 5 and peer-judges 1 → median used should be 1, not 5.
    seedCell(db, {
      batch: "b1",
      promptId,
      modelId: "m:a",
      scores: [
        { judge: "m:a", score: 5 },
        { judge: "j:1", score: 1 },
      ],
      ranking: ["m:a", "m:b"],
      ranker: "m:a",
    });
    seedCell(db, {
      batch: "b1",
      promptId,
      modelId: "m:b",
      scores: [
        { judge: "m:b", score: 1 },
        { judge: "j:1", score: 5 },
      ],
      ranking: ["m:a", "m:b"],
      ranker: "m:b",
    });

    const result = calibrateFromDb(db, { runBatchId: "b1" });
    const models = result.groups[0]!.models;
    expect(models.find((m) => m.modelId === "m:a")!.judgeMedian).toBe(1);
    expect(models.find((m) => m.modelId === "m:b")!.judgeMedian).toBe(5);
    expect(result.groups[0]!.spearmanPeerVsJudge).toBeCloseTo(-1);
  });

  test("compares optional human labels", () => {
    const db = createDb();
    const promptId = "p";
    const ranking = ["m:a", "m:b"];
    seedCell(db, {
      batch: "b1",
      promptId,
      modelId: "m:a",
      scores: [{ judge: "j:1", score: 5 }],
      ranking,
      ranker: "m:a",
    });
    seedCell(db, {
      batch: "b1",
      promptId,
      modelId: "m:b",
      scores: [{ judge: "j:1", score: 2 }],
      ranking,
      ranker: "m:b",
    });

    const human = parseHumanLabels(
      { groups: [{ promptId, ranking: ["m:a", "m:b"] }] },
      "h.json",
    );
    const result = calibrateFromDb(db, { runBatchId: "b1", humanByKey: human });
    expect(result.groups[0]!.spearmanPeerVsHuman).toBeCloseTo(1);
    expect(result.groups[0]!.spearmanJudgeVsHuman).toBeCloseTo(1);
    expect(result.humanLabelCount).toBe(1);
  });

  test("skips groups with fewer than two models that have both signals", () => {
    const db = createDb();
    seedCell(db, {
      batch: "b1",
      promptId: "only-one",
      modelId: "m:a",
      scores: [{ judge: "j:1", score: 4 }],
      ranking: ["m:a"],
      ranker: "m:a",
    });
    const result = calibrateFromDb(db, { runBatchId: "b1" });
    expect(result.groups).toHaveLength(0);
    expect(result.skippedGroups).toBe(1);
    expect(result.meanSpearmanPeerVsJudge).toBeUndefined();
  });
});
