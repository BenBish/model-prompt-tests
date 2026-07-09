import type { Database } from "bun:sqlite";
import type { ModelAdapter } from "../providers/types";
import type { PromptDefinition } from "../types";
import { insertRun, type RunRecord } from "../db/runsRepo";
import { insertScore } from "../db/scoresRepo";
import { runJudge } from "../judge/judge";
import { createLimiter, type Limiter } from "../util/concurrency";
import { withRetry } from "../util/retry";
import type { CandidateRunner } from "./candidateRunner";

export interface RunBatchOptions {
  db: Database;
  prompts: PromptDefinition[];
  runners: CandidateRunner[];
  defaultConcurrency: number;
  judge?: {
    adapter: ModelAdapter;
    modelId: string;
  };
}

export interface RunBatchSummary {
  runBatchId: string;
  ok: number;
  errored: number;
  avgScoreByModel: Record<string, number>;
  wallClockMs: number;
}

function makeRunBatchId(): string {
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${now}-${suffix}`;
}

export async function runBatch(options: RunBatchOptions): Promise<RunBatchSummary> {
  const { db, prompts, runners, defaultConcurrency, judge } = options;
  const started = performance.now();
  const runBatchId = makeRunBatchId();

  if (judge && runners.some((r) => r.id === judge.modelId)) {
    console.warn(
      `[warn] judge model "${judge.modelId}" is also present in the active --models selection; ` +
        "its own outputs will be judged by itself for this run.",
    );
  }

  const limiters = new Map<string, Limiter>();
  function limiterFor(runner: CandidateRunner): Limiter {
    const key = runner.id;
    let limiter = limiters.get(key);
    if (!limiter) {
      limiter = createLimiter(runner.maxConcurrent ?? defaultConcurrency);
      limiters.set(key, limiter);
    }
    return limiter;
  }

  let ok = 0;
  let errored = 0;
  const okRunIds: { runId: number; modelId: string; outputText: string; promptId: string }[] = [];

  const candidateTasks: Promise<void>[] = [];
  for (const prompt of prompts) {
    for (const runner of runners) {
      const limiter = limiterFor(runner);
      candidateTasks.push(
        limiter(async () => {
          const startedAt = new Date().toISOString();
          const label = `${prompt.id} x ${runner.id}`;
          try {
            const result = await withRetry(() => runner.run(prompt));
            const record: RunRecord = {
              runBatchId,
              promptId: prompt.id,
              providerId: runner.providerId,
              modelId: runner.id,
              modelName: runner.modelName,
              startedAt,
              latencyMs: Math.round(result.latencyMs),
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              outputText: result.outputText,
              rawResponse: JSON.stringify(result.raw),
              status: "ok",
            };
            const runId = insertRun(db, record);
            ok++;
            okRunIds.push({ runId, modelId: runner.id, outputText: result.outputText, promptId: prompt.id });
            console.log(`[ok] ${label} (${Math.round(result.latencyMs)}ms)`);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            insertRun(db, {
              runBatchId,
              promptId: prompt.id,
              providerId: runner.providerId,
              modelId: runner.id,
              modelName: runner.modelName,
              startedAt,
              status: "error",
              error: message,
            });
            errored++;
            console.log(`[error] ${label}: ${message}`);
          }
        }),
      );
    }
  }

  await Promise.all(candidateTasks);

  const avgScoreByModel: Record<string, number> = {};

  if (judge) {
    const judgeLimiter = createLimiter(defaultConcurrency);
    const scoresByModel = new Map<string, number[]>();

    const judgeTasks = okRunIds.map(({ runId, modelId, outputText, promptId }) =>
      judgeLimiter(async () => {
        const prompt = prompts.find((p) => p.id === promptId)!;
        const outcome = await runJudge(judge.adapter, prompt, outputText);
        insertScore(db, {
          runId,
          judgeModelId: judge.modelId,
          score: outcome.result?.score,
          rationale: outcome.result?.rationale,
          rawJudgeOutput: outcome.rawJudgeText,
          scoredAt: new Date().toISOString(),
          error: outcome.error,
          status: outcome.result ? "ok" : "error",
        });
        if (outcome.result) {
          const list = scoresByModel.get(modelId) ?? [];
          list.push(outcome.result.score);
          scoresByModel.set(modelId, list);
        } else {
          console.log(`[judge-error] ${promptId} x ${modelId}: ${outcome.error}`);
        }
      }),
    );

    await Promise.all(judgeTasks);

    for (const [modelId, scores] of scoresByModel) {
      avgScoreByModel[modelId] = scores.reduce((a, b) => a + b, 0) / scores.length;
    }
  }

  const wallClockMs = performance.now() - started;

  console.log(`\nBatch ${runBatchId}: ${ok} ok, ${errored} errored, ${Math.round(wallClockMs)}ms`);
  for (const [modelId, avg] of Object.entries(avgScoreByModel)) {
    console.log(`  ${modelId}: avg score ${avg.toFixed(2)}`);
  }

  return { runBatchId, ok, errored, avgScoreByModel, wallClockMs };
}
