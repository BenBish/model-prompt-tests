import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { insertRun } from "../db/runsRepo";
import { insertPeerRank } from "../db/peerRanksRepo";
import { applyMigrations } from "../db/client";
import { groupsFromBatch, peerRankOrderFromRankings } from "./groups";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  applyMigrations(db);
  return db;
}

describe("peerRankOrderFromRankings", () => {
  test("orders by Borda then model id", () => {
    expect(peerRankOrderFromRankings([["a", "b"], ["a", "b"]])).toEqual(["a", "b"]);
    expect(peerRankOrderFromRankings([])).toBeUndefined();
  });
});

describe("groupsFromBatch", () => {
  test("groups ok prompt runs and attaches peer-rank order", () => {
    const db = createDb();
    insertRun(db, {
      runBatchId: "b1",
      promptId: "p",
      providerId: "t",
      modelId: "m:a",
      modelName: "a",
      startedAt: "2026-08-13T00:00:00.000Z",
      status: "ok",
      outputText: "A",
    });
    insertRun(db, {
      runBatchId: "b1",
      promptId: "p",
      providerId: "t",
      modelId: "m:b",
      modelName: "b",
      startedAt: "2026-08-13T00:00:00.000Z",
      status: "ok",
      outputText: "B",
    });
    insertPeerRank(db, {
      runBatchId: "b1",
      promptId: "p",
      repeatIndex: 0,
      rankerModelId: "m:a",
      labelMapping: "{}",
      rankingModelIds: JSON.stringify(["m:b", "m:a"]),
      status: "ok",
      rankedAt: "2026-08-13T00:00:01.000Z",
    });

    const groups = groupsFromBatch(db, "b1", new Map([["p", "Do it"]]));
    expect(groups).toHaveLength(1);
    expect(groups[0]!.candidates.map((c) => c.modelId).sort()).toEqual(["m:a", "m:b"]);
    expect(groups[0]!.peerRankOrder).toEqual(["m:b", "m:a"]);
    expect(groups[0]!.promptText).toBe("Do it");
  });
});
