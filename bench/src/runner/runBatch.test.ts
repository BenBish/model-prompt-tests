import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import type { ModelAdapter } from "../providers/types";
import type { PromptDefinition } from "../types";
import type { CandidateRunner } from "./candidateRunner";
import { runBatch } from "./runBatch";
import { buildResultContract } from "../contract/resultContract";

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
  test("persists prompt outcome categories for successful and failed calls", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    const providerError = Object.assign(new Error("provider error 503: unavailable"), { status: 503 });
    await runBatch({
      db,
      prompts: [prompts[0]!],
      runners: [
        candidate("ok-model", "provider", async () => ({ outputText: "", raw: {}, latencyMs: 1 })),
        candidate("failed-model", "provider", async () => { throw providerError; }),
      ],
      defaultConcurrency: 2,
    });

    const rows = db.query("SELECT model_id, outcome_category FROM runs ORDER BY model_id").all();
    expect(rows).toEqual([
      { model_id: "failed-model", outcome_category: "provider_error" },
      { model_id: "ok-model", outcome_category: "candidate_failure" },
    ]);
    db.close();
  });
  test("links every new run to one durable experiment", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    const summary = await runBatch({ db, prompts: [prompts[0]!], runners: [candidate("model-a", "provider", async () => ({ outputText: "ok", raw: {}, latencyMs: 1 }))], defaultConcurrency: 1 });
    const row = db.query("SELECT experiment_id FROM runs WHERE run_batch_id = ?").get(summary.runBatchId) as { experiment_id: string };
    expect(row.experiment_id).toStartWith("exp_");
    expect((db.query("SELECT COUNT(*) AS count FROM experiments WHERE id = ?").get(row.experiment_id) as { count: number }).count).toBe(1);
    db.close();
  });
  test("reuses a frozen experiment for a prompt subset without rewriting its manifest", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    const runner = candidate("model-a", "provider", async () => ({ outputText: "ok", raw: {}, latencyMs: 1 }));
    const judge: ModelAdapter = {
      providerId: "judge",
      modelName: "judge",
      async call() {
        return { text: '{"score":5,"rationale":"ok"}', raw: {}, latencyMs: 1 };
      },
    };
    const first = await runBatch({ db, prompts: prompts.slice(0, 2), runners: [runner], defaultConcurrency: 1, judge: { adapter: judge, modelId: "judge" } });
    // Model a window kill after the full suite was frozen but before prompt 2 completed.
    db.query("DELETE FROM runs WHERE run_batch_id = ? AND prompt_id = ?").run(first.runBatchId, prompts[1]!.id);
    const second = await runBatch({ db, prompts: [prompts[1]!], runners: [runner], defaultConcurrency: 1, experimentId: first.experimentId, judge: { adapter: judge, modelId: "judge" } });

    expect(second.experimentId).toBe(first.experimentId);
    expect(second.runBatchId).not.toBe(first.runBatchId);
    expect((db.query("SELECT COUNT(*) AS count FROM experiments").get() as { count: number }).count).toBe(1);
    const manifest = JSON.parse((db.query("SELECT manifest_json FROM experiments WHERE id = ?").get(first.experimentId) as { manifest_json: string }).manifest_json);
    expect(manifest.tasks.map((task: { id: string }) => task.id)).toEqual(["test/prompt-1", "test/prompt-2"]);

    const contract = buildResultContract(
      db,
      [first.runBatchId, second.runBatchId],
      "model-a",
      "prompt",
    );
    expect(contract.runBatchIds).toEqual([first.runBatchId, second.runBatchId]);
    db.close();
  });

  test("rejects unknown experiments, tasks outside the frozen suite, and semantic drift before calls", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    let calls = 0;
    const runner = candidate("model-a", "provider", async () => { calls++; return { outputText: "ok", raw: {}, latencyMs: 1 }; });
    await expect(runBatch({ db, prompts: [prompts[0]!], runners: [runner], defaultConcurrency: 1, experimentId: "exp_missing" })).rejects.toThrow('unknown experiment id "exp_missing"');
    const first = await runBatch({ db, prompts: prompts.slice(0, 2), runners: [runner], defaultConcurrency: 1 });
    const afterFirst = calls;
    await expect(runBatch({ db, prompts: [prompts[2]!], runners: [runner], defaultConcurrency: 1, experimentId: first.experimentId })).rejects.toThrow(/absent from the frozen manifest.*test\/prompt-3/);
    await expect(runBatch({ db, prompts: [prompts[0]!], runners: [candidate("model-b", "provider", runner.run)], defaultConcurrency: 1, experimentId: first.experimentId })).rejects.toThrow(/incompatible experiment manifest at models/);
    expect(calls).toBe(afterFirst);
    db.close();
  });
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

  test("runs each cell `repeats` times, stamping repeat_index", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();
    let callCount = 0;

    await runBatch({
      db,
      prompts: [prompts[0]!],
      runners: [
        candidate("candidate", "candidate", async () => {
          callCount++;
          return { outputText: "ok", raw: {}, latencyMs: 1 };
        }),
      ],
      defaultConcurrency: 2,
      repeats: 3,
    });

    expect(callCount).toBe(3);
    const rows = db
      .query("SELECT repeat_index FROM runs ORDER BY repeat_index")
      .all() as { repeat_index: number }[];
    expect(rows.map((r) => r.repeat_index)).toEqual([0, 1, 2]);
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

  test("defaults to a single run per cell when repeats is omitted", async () => {
    spyOn(console, "log").mockImplementation(() => {});
    const db = createDb();

    await runBatch({
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
    });

    const rows = db.query("SELECT repeat_index FROM runs").all() as { repeat_index: number }[];
    expect(rows).toEqual([{ repeat_index: 0 }]);
    db.close();
  });
});
