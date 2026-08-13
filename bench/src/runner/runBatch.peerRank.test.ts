import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import type { ModelAdapter } from "../providers/types";
import type { PromptDefinition } from "../types";
import type { CandidateRunner } from "./candidateRunner";
import { runBatch } from "./runBatch";
import { applyMigrations } from "../db/client";

const prompt: PromptDefinition = {
  id: "test/peer",
  filePath: "test/peer.md",
  title: "Peer",
  promptText: "Rank me",
  whatThisTests: [],
  strongSignals: [],
  weakSignals: [],
  rubric: [
    { score: 5, description: "Excellent" },
    { score: 4, description: "Good" },
    { score: 3, description: "Acceptable" },
    { score: 2, description: "Weak" },
    { score: 1, description: "Poor" },
  ],
};

function createDb(): Database {
  const db = new Database(":memory:");
  const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
  db.exec(schema);
  applyMigrations(db);
  return db;
}

function candidate(id: string, text: string): CandidateRunner {
  return {
    id,
    providerId: "p",
    modelName: id,
    run: async () => ({ outputText: text, raw: {}, latencyMs: 1 }),
  };
}

function rankerAdapter(modelId: string, order: string[]): ModelAdapter {
  return {
    providerId: "p",
    modelName: modelId,
    async call(input) {
      const labels = [...input.userPrompt.matchAll(/### Response ([A-Z])/g)].map((m) => m[1]!);
      // Map desired model order onto current labels via a crude approach: rank by label order
      // and let runOnePeerRank deanonymize — for storage we just need a valid permutation.
      void order;
      return {
        text: JSON.stringify({ ranking: labels, rationale: `by ${modelId}` }),
        raw: {},
        latencyMs: 2,
        inputTokens: 100,
        outputTokens: 20,
      };
    },
  };
}

afterEach(() => {
  spyOn(console, "log").mockRestore();
  spyOn(console, "warn").mockRestore();
});

describe("runBatch peerRank", () => {
  test("persists peer_ranks rows with cost tokens and does not change scores table", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    spyOn(console, "warn").mockImplementation(() => {});
    const db = createDb();

    const summary = await runBatch({
      db,
      prompts: [prompt],
      runners: [candidate("m1", "answer one"), candidate("m2", "answer two")],
      defaultConcurrency: 2,
      peerRank: {
        rankers: [
          { adapter: rankerAdapter("m1", ["m1", "m2"]), modelId: "m1" },
          { adapter: rankerAdapter("m2", ["m2", "m1"]), modelId: "m2" },
        ],
      },
    });

    expect(summary.peerRankOk).toBe(2);
    expect(summary.peerRankErrored).toBe(0);

    const ranks = db.query("SELECT * FROM peer_ranks").all() as any[];
    expect(ranks).toHaveLength(2);
    for (const row of ranks) {
      expect(row.status).toBe("ok");
      expect(row.label_mapping).toBeTruthy();
      expect(JSON.parse(row.label_mapping)).toBeTypeOf("object");
      expect(JSON.parse(row.ranking_model_ids)).toBeArray();
      expect(row.input_tokens).toBe(100);
      expect(row.output_tokens).toBe(20);
      // No pricing/costUsd on adapters → cost may be null; tokens still tracked
    }

    const scores = db.query("SELECT COUNT(*) as n FROM scores").get() as { n: number };
    expect(scores.n).toBe(0);

    db.close();
  });

  test("skips peer rank when fewer than 2 ok candidates", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();

    const summary = await runBatch({
      db,
      prompts: [prompt],
      runners: [candidate("only", "solo")],
      defaultConcurrency: 1,
      peerRank: {
        rankers: [{ adapter: rankerAdapter("only", ["only"]), modelId: "only" }],
      },
    });

    expect(summary.peerRankOk).toBe(0);
    expect(db.query("SELECT COUNT(*) as n FROM peer_ranks").get() as { n: number }).toEqual({
      n: 0,
    });
    db.close();
  });
});
