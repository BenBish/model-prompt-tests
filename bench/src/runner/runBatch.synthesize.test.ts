import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import type { ModelAdapter } from "../providers/types";
import type { PromptDefinition } from "../types";
import type { CandidateRunner } from "./candidateRunner";
import { runBatch } from "./runBatch";
import { applyMigrations } from "../db/client";

const prompt: PromptDefinition = {
  id: "test/syn",
  filePath: "test/syn.md",
  title: "Syn",
  promptText: "Combine me",
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
  db.exec(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
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

function chairmanAdapter(): ModelAdapter {
  return {
    providerId: "p",
    modelName: "chair",
    async call() {
      return {
        text: JSON.stringify({
          answer: "Combined answer",
          provenance: { usedModelIds: ["m1", "m2"], notes: "merged" },
        }),
        raw: {},
        latencyMs: 4,
        inputTokens: 50,
        outputTokens: 12,
        costUsd: 0.02,
      };
    },
  };
}

afterEach(() => {
  spyOn(console, "log").mockRestore();
  spyOn(console, "warn").mockRestore();
});

describe("runBatch synthesize", () => {
  test("persists synthesis rows and does not write scores", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    spyOn(console, "warn").mockImplementation(() => {});
    const db = createDb();

    const summary = await runBatch({
      db,
      prompts: [prompt],
      runners: [candidate("m1", "one"), candidate("m2", "two")],
      defaultConcurrency: 2,
      synthesize: {
        chairman: { adapter: chairmanAdapter(), modelId: "chair" },
      },
    });

    expect(summary.synthesizeOk).toBe(1);
    expect(summary.synthesizeErrored).toBe(0);
    const rows = db.query("SELECT * FROM syntheses").all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("ok");
    expect(rows[0]!.chairman_model_id).toBe("chair");
    expect(rows[0]!.synthesis_text).toBe("Combined answer");
    expect(rows[0]!.cost_usd).toBe(0.02);
    const prov = JSON.parse(rows[0]!.provenance);
    expect(prov.candidateModelIds.sort()).toEqual(["m1", "m2"]);
    expect(db.query("SELECT COUNT(*) as n FROM scores").get() as { n: number }).toEqual({ n: 0 });
    db.close();
  });

  test("skips synthesis when fewer than 2 ok candidates", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    const summary = await runBatch({
      db,
      prompts: [prompt],
      runners: [candidate("only", "solo")],
      defaultConcurrency: 1,
      synthesize: { chairman: { adapter: chairmanAdapter(), modelId: "chair" } },
    });
    expect(summary.synthesizeOk).toBe(0);
    expect(db.query("SELECT COUNT(*) as n FROM syntheses").get() as { n: number }).toEqual({ n: 0 });
    db.close();
  });
});
