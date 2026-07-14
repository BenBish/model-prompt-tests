import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import type { ModelAdapter } from "../providers/types";
import type { PromptDefinition } from "../types";
import type { CandidateRunner } from "./candidateRunner";
import { runBatch } from "./runBatch";

const prompts: PromptDefinition[] = [1, 2, 3].map((number) => ({
  id: `test/prompt-${number}`,
  filePath: `test/prompt-${number}.md`,
  title: `Prompt ${number}`,
  promptText: "Test",
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
}));

function createDb(): Database {
  const db = new Database(":memory:");
  const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
  db.exec(schema);
  return db;
}

function candidate(id: string, providerId: string, run: CandidateRunner["run"]): CandidateRunner {
  return { id, providerId, modelName: id, run };
}

afterEach(() => {
  spyOn(console, "log").mockRestore();
});

describe("runBatch concurrency", () => {
  test("shares the default concurrency limit across models from one provider", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    let active = 0;
    let peak = 0;
    const run: CandidateRunner["run"] = async () => {
      active++;
      peak = Math.max(peak, active);
      await Bun.sleep(5);
      active--;
      return { outputText: "ok", raw: {}, latencyMs: 5 };
    };

    await runBatch({
      db,
      prompts,
      runners: [candidate("model-a", "shared", run), candidate("model-b", "shared", run)],
      defaultConcurrency: 1,
    });

    expect(peak).toBe(1);
    db.close();
  });

  test("honors a judge-specific concurrency limit", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    let active = 0;
    let peak = 0;
    const judge: ModelAdapter = {
      providerId: "judge",
      modelName: "judge",
      async call() {
        active++;
        peak = Math.max(peak, active);
        await Bun.sleep(5);
        active--;
        return {
          text: '{"score":5,"rationale":"Excellent"}',
          raw: {},
          latencyMs: 5,
        };
      },
    };

    await runBatch({
      db,
      prompts,
      runners: [
        candidate("candidate", "candidate", async () => ({
          outputText: "ok",
          raw: {},
          latencyMs: 1,
        })),
      ],
      defaultConcurrency: 3,
      judge: { adapter: judge, modelId: "judge", maxConcurrent: 1 },
    });

    expect(peak).toBe(1);
    db.close();
  });

  test("reports judge failures in the batch summary", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    const judge: ModelAdapter = {
      providerId: "judge",
      modelName: "judge",
      async call() {
        const error = new Error("unauthorized") as Error & { status?: number };
        error.status = 401;
        throw error;
      },
    };

    const summary = await runBatch({
      db,
      prompts: [prompts[0]!],
      runners: [
        candidate("candidate", "candidate", async () => ({
          outputText: "ok",
          raw: {},
          latencyMs: 1,
        })),
      ],
      defaultConcurrency: 1,
      judge: { adapter: judge, modelId: "judge" },
    });

    expect(summary.errored).toBe(0);
    expect(summary.judgeErrored).toBe(1);
    db.close();
  });

  test("scores each candidate with multiple judges", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    const makeJudge = (score: number): ModelAdapter => ({
      providerId: "judge",
      modelName: `judge-${score}`,
      async call() {
        return {
          text: `{"score":${score},"rationale":"score ${score}"}`,
          raw: {},
          latencyMs: 1,
        };
      },
    });

    const summary = await runBatch({
      db,
      prompts: [prompts[0]!],
      runners: [
        candidate("candidate", "candidate", async () => ({
          outputText: "ok",
          raw: {},
          latencyMs: 1,
        })),
      ],
      defaultConcurrency: 1,
      judges: [
        { adapter: makeJudge(4), modelId: "judge-a" },
        { adapter: makeJudge(5), modelId: "judge-b" },
      ],
    });

    const scores = db.query("SELECT judge_model_id, score FROM scores ORDER BY judge_model_id").all() as {
      judge_model_id: string;
      score: number;
    }[];
    expect(scores).toEqual([
      { judge_model_id: "judge-a", score: 4 },
      { judge_model_id: "judge-b", score: 5 },
    ]);
    expect(summary.avgScoreByModel.candidate).toBe(4.5);
    db.close();
  });

  test("computes cost from model pricing when the provider doesn't report it", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    const runner: CandidateRunner = {
      id: "candidate",
      providerId: "test",
      modelName: "candidate",
      pricing: { inputPerMTok: 2, outputPerMTok: 10 },
      run: async () => ({
        outputText: "ok",
        raw: {},
        latencyMs: 1,
        inputTokens: 1000,
        outputTokens: 500,
        stopReason: "length",
      }),
    };

    await runBatch({
      db,
      prompts: [prompts[0]!],
      runners: [runner],
      defaultConcurrency: 1,
    });

    const row = db.query("SELECT cost_usd, stop_reason FROM runs").get() as {
      cost_usd: number;
      stop_reason: string;
    };
    expect(row.cost_usd).toBeCloseTo(0.007);
    expect(row.stop_reason).toBe("length");
    db.close();
  });

  test("prefers provider-reported cost over computed pricing", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    const runner: CandidateRunner = {
      id: "candidate",
      providerId: "test",
      modelName: "candidate",
      pricing: { inputPerMTok: 2, outputPerMTok: 10 },
      run: async () => ({
        outputText: "ok",
        raw: {},
        latencyMs: 1,
        inputTokens: 1000,
        outputTokens: 500,
        costUsd: 0.0123,
      }),
    };

    await runBatch({
      db,
      prompts: [prompts[0]!],
      runners: [runner],
      defaultConcurrency: 1,
    });

    const row = db.query("SELECT cost_usd FROM runs").get() as { cost_usd: number };
    expect(row.cost_usd).toBeCloseTo(0.0123);
    db.close();
  });

  test("runs each prompt x model repeats times and records the attempt number", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    let calls = 0;
    const runner = candidate("candidate", "candidate", async () => {
      calls++;
      return { outputText: "ok", raw: {}, latencyMs: 1 };
    });

    const summary = await runBatch({
      db,
      prompts: [prompts[0]!],
      runners: [runner],
      defaultConcurrency: 2,
      repeats: 3,
    });

    expect(calls).toBe(3);
    expect(summary.ok).toBe(3);
    const attempts = (
      db.query("SELECT attempt FROM runs ORDER BY attempt").all() as { attempt: number }[]
    ).map((r) => r.attempt);
    expect(attempts).toEqual([1, 2, 3]);
    db.close();
  });
});
