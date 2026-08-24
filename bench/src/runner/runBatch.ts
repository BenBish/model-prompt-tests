import type { Database } from "bun:sqlite";
import type { ModelAdapter } from "../providers/types";
import type { PromptDefinition } from "../types";
import { insertRun, type RunRecord } from "../db/runsRepo";
import { insertScore } from "../db/scoresRepo";
import { insertPeerRank } from "../db/peerRanksRepo";
import { runJudge } from "../judge/judge";
import { runOnePeerRank, type PeerRanker } from "../peerRank/runPeerRank";
import { groupsFromBatch, runSynthesisForGroups } from "../synthesize/groups";
import type { Chairman } from "../synthesize/runSynthesis";
import { createLimiter, type Limiter } from "../util/concurrency";
import { withRetry } from "../util/retry";
import type { CandidateRunner } from "./candidateRunner";
import { insertExperiment } from "../db/experimentsRepo";
import { EXPERIMENT_SCHEMA_VERSION, canonicalJson, fingerprintEnvironment, repositoryState, sha256, type ExperimentManifest } from "../experiment/manifest";

export interface RunBatchOptions {
  db: Database;
  prompts: PromptDefinition[];
  runners: CandidateRunner[];
  defaultConcurrency: number;
  experimentManifest?: ExperimentManifest;
  /** Number of independent runs per (prompt, runner) cell. Defaults to 1. */
  repeats?: number;
  judge?: {
    adapter: ModelAdapter;
    modelId: string;
    maxConcurrent?: number;
  };
  judges?: {
    adapter: ModelAdapter;
    modelId: string;
    maxConcurrent?: number;
  }[];
  /**
   * When set, after candidates (+ judges), run anonymized peer ranking for each
   * (prompt, repeat) group with ≥2 ok outputs. Rankers are the provided adapters
   * (typically one per candidate model id). Secondary signal only — does not
   * change rubric scores.
   */
  peerRank?: {
    rankers: PeerRanker[];
  };
  /**
   * When set, after candidates (+ optional judges/peer ranks), run one chairman
   * synthesis per (prompt, repeat) with ≥2 ok outputs. Answer production only —
   * does not change rubric scores.
   */
  synthesize?: {
    chairman: Chairman;
  };
}

export interface RunBatchSummary {
  runBatchId: string;
  experimentId: string;
  ok: number;
  errored: number;
  judgeErrored: number;
  peerRankOk: number;
  peerRankErrored: number;
  synthesizeOk: number;
  synthesizeErrored: number;
  avgScoreByModel: Record<string, number>;
  wallClockMs: number;
}

function makeRunBatchId(): string {
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${now}-${suffix}`;
}

/** Provider-reported cost is authoritative; else pricing × tokens. */
export function resolveCostUsd(
  runner: CandidateRunner,
  result: { costUsd?: number; inputTokens?: number; outputTokens?: number },
): number | undefined {
  if (result.costUsd !== undefined) return result.costUsd;
  if (!runner.pricing) return undefined;
  if (result.inputTokens === undefined || result.outputTokens === undefined) return undefined;
  const { inputPerMTok, outputPerMTok } = runner.pricing;
  return (result.inputTokens * inputPerMTok + result.outputTokens * outputPerMTok) / 1_000_000;
}

export async function runBatch(options: RunBatchOptions): Promise<RunBatchSummary> {
  const { db, prompts, runners, defaultConcurrency } = options;
  const repeats = options.repeats ?? 1;
  const judges = options.judges ?? (options.judge ? [options.judge] : []);
  const started = performance.now();
  const runBatchId = makeRunBatchId();
  const createdAt = new Date().toISOString();
  const experimentManifest: ExperimentManifest = options.experimentManifest ?? {
    schemaVersion: EXPERIMENT_SCHEMA_VERSION,
    createdAt,
    suite: { id: "model-prompt-tests", version: "1" },
    repository: repositoryState(process.cwd()),
    tasks: prompts.map((prompt) => ({ id: prompt.id, sha256: sha256(canonicalJson({ title: prompt.title, promptText: prompt.promptText, whatThisTests: prompt.whatThisTests, strongSignals: prompt.strongSignals, weakSignals: prompt.weakSignals, rubric: prompt.rubric, dimensions: prompt.dimensions })) })).sort((a, b) => a.id.localeCompare(b.id)),
    models: runners.map((runner) => runner.manifestIdentity ?? ({ id: runner.id, provider: runner.providerId, model: runner.modelName })),
    judges: judges.map((judge) => ({ id: judge.modelId, modelId: judge.modelId, sha256: sha256(canonicalJson({ modelId: judge.modelId, graders: prompts.map((prompt) => ({ id: prompt.id, rubric: prompt.rubric, dimensions: prompt.dimensions })) })) })),
    harness: { id: "prompt-runner", version: "1", config: { concurrency: defaultConcurrency } },
    prompts: {}, limits: {}, toolPermissions: [], plannedRepeats: repeats, exclusions: [],
    environment: fingerprintEnvironment({ executionDomain: process.env.BENCH_EXECUTION_DOMAIN ?? "interactive-lab", concurrency: defaultConcurrency }),
  };
  const experimentId = insertExperiment(db, experimentManifest);

  for (const judge of judges) {
    if (runners.some((r) => r.id === judge.modelId)) {
      console.warn(
        `[warn] judge model "${judge.modelId}" is also present in the active --models selection; ` +
          "its own outputs will be judged by itself for this run.",
      );
    }
  }

  const providerLimiters = new Map<string, Limiter>();
  const runnerLimiters = new Map<string, Limiter>();
  function providerLimiterFor(runner: CandidateRunner): Limiter {
    let limiter = providerLimiters.get(runner.providerId);
    if (!limiter) {
      limiter = createLimiter(defaultConcurrency);
      providerLimiters.set(runner.providerId, limiter);
    }
    return limiter;
  }
  function runnerLimiterFor(runner: CandidateRunner): Limiter | undefined {
    if (runner.maxConcurrent === undefined) return undefined;
    let limiter = runnerLimiters.get(runner.id);
    if (!limiter) {
      limiter = createLimiter(runner.maxConcurrent);
      runnerLimiters.set(runner.id, limiter);
    }
    return limiter;
  }

  let ok = 0;
  let errored = 0;
  let judgeErrored = 0;
  let peerRankOk = 0;
  let peerRankErrored = 0;
  let synthesizeOk = 0;
  let synthesizeErrored = 0;
  const okRunIds: {
    runId: number;
    modelId: string;
    outputText: string;
    promptId: string;
    repeatIndex: number;
  }[] = [];

  const candidateTasks: Promise<void>[] = [];
  for (const prompt of prompts) {
    for (const runner of runners) {
      for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex++) {
        const providerLimiter = providerLimiterFor(runner);
        const runnerLimiter = runnerLimiterFor(runner);
        const run = async () => {
          await providerLimiter(() => executeCandidate(prompt, runner, repeatIndex));
        };
        candidateTasks.push(runnerLimiter ? runnerLimiter(run) : run());
      }
    }
  }

  async function executeCandidate(
    prompt: PromptDefinition,
    runner: CandidateRunner,
    repeatIndex: number,
  ): Promise<void> {
    const startedAt = new Date().toISOString();
    const label =
      repeats > 1 ? `${prompt.id} x ${runner.id} (repeat ${repeatIndex + 1}/${repeats})` : `${prompt.id} x ${runner.id}`;
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
        repeatIndex,
        stopReason: result.stopReason,
        costUsd: resolveCostUsd(runner, result),
        experimentId,
      };
      const runId = insertRun(db, record);
      ok++;
      okRunIds.push({
        runId,
        modelId: runner.id,
        outputText: result.outputText,
        promptId: prompt.id,
        repeatIndex,
      });
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
        repeatIndex,
        experimentId,
      });
      errored++;
      console.log(`[error] ${label}: ${message}`);
    }
  }

  await Promise.all(candidateTasks);

  const avgScoreByModel: Record<string, number> = {};

  if (judges.length > 0) {
    const scoresByModel = new Map<string, number[]>();

    const judgeLimiters = new Map(
      judges.map((judge) => [judge.modelId, createLimiter(judge.maxConcurrent ?? defaultConcurrency)]),
    );
    const judgeTasks = okRunIds.flatMap(({ runId, modelId, outputText, promptId }) =>
      judges.map((judge) =>
        judgeLimiters.get(judge.modelId)!(async () => {
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
            dimensionScores: outcome.result?.dimensions,
            weightedScore: outcome.result?.weightedScore,
          });
          if (outcome.result) {
            const list = scoresByModel.get(modelId) ?? [];
            list.push(outcome.result.score);
            scoresByModel.set(modelId, list);
          } else {
            judgeErrored++;
            console.log(`[judge-error] ${promptId} x ${modelId} judged by ${judge.modelId}: ${outcome.error}`);
          }
        }),
      ),
    );

    await Promise.all(judgeTasks);

    for (const [modelId, scores] of scoresByModel) {
      avgScoreByModel[modelId] = scores.reduce((a, b) => a + b, 0) / scores.length;
    }
  }

  if (options.peerRank && options.peerRank.rankers.length > 0) {
    const rankerById = new Map(options.peerRank.rankers.map((r) => [r.modelId, r]));
    const groups = new Map<string, typeof okRunIds>();
    for (const entry of okRunIds) {
      const key = `${entry.promptId}\0${entry.repeatIndex}`;
      const list = groups.get(key) ?? [];
      list.push(entry);
      groups.set(key, list);
    }

    const peerRankLimiters = new Map(
      options.peerRank.rankers.map((ranker) => [
        ranker.modelId,
        createLimiter(ranker.maxConcurrent ?? defaultConcurrency),
      ]),
    );

    const peerTasks: Promise<void>[] = [];
    for (const [, group] of groups) {
      if (group.length < 2) continue;
      // One response per model in the group (if a model somehow duplicated, keep first).
      const byModel = new Map<string, (typeof group)[number]>();
      for (const entry of group) {
        if (!byModel.has(entry.modelId)) byModel.set(entry.modelId, entry);
      }
      const candidates = [...byModel.values()].map((e) => ({
        modelId: e.modelId,
        outputText: e.outputText,
      }));
      if (candidates.length < 2) continue;

      const promptId = group[0]!.promptId;
      const repeatIndex = group[0]!.repeatIndex;
      const prompt = prompts.find((p) => p.id === promptId)!;

      for (const candidate of candidates) {
        const ranker = rankerById.get(candidate.modelId);
        if (!ranker) continue;
        const limiter = peerRankLimiters.get(ranker.modelId)!;
        peerTasks.push(
          limiter(async () => {
            const result = await runOnePeerRank(ranker, prompt.promptText, candidates);
            insertPeerRank(db, {
              runBatchId,
              promptId,
              repeatIndex,
              rankerModelId: result.rankerModelId,
              labelMapping: JSON.stringify(result.labelToModelId),
              rankingLabels:
                result.status === "ok" ? JSON.stringify(result.rankingLabels) : undefined,
              rankingModelIds:
                result.status === "ok" ? JSON.stringify(result.rankingModelIds) : undefined,
              rationale: result.status === "ok" ? result.rationale : undefined,
              rawOutput: result.rawOutput || undefined,
              latencyMs: result.latencyMs,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              costUsd: result.costUsd,
              status: result.status,
              error: result.status === "error" ? result.error : undefined,
              rankedAt: new Date().toISOString(),
            });
            // Counter updates are safe under concurrent async tasks: JS is single-threaded,
            // so ++ cannot interleave mid-statement (same pattern as judgeErrored).
            if (result.status === "ok") {
              peerRankOk++;
              console.log(
                `[peer-rank] ${promptId} ranked by ${result.rankerModelId}: ${result.rankingModelIds.join(" > ")}`,
              );
            } else {
              peerRankErrored++;
              console.log(
                `[peer-rank-error] ${promptId} ranked by ${result.rankerModelId}: ${result.error}`,
              );
            }
          }),
        );
      }
    }

    if (peerTasks.length > 0) {
      console.warn(
        `[warn] --peer-rank: about to run ${peerTasks.length} ranking call(s) ` +
          `(≈ one large-context call per successful candidate per prompt/repeat). ` +
          "This is a secondary signal and does not replace rubric scores.",
      );
      await Promise.all(peerTasks);
    }
  }

  if (options.synthesize) {
    const promptTextById = new Map(prompts.map((p) => [p.id, p.promptText]));
    const groups = groupsFromBatch(db, runBatchId, promptTextById);
    const syn = await runSynthesisForGroups(
      db,
      runBatchId,
      groups,
      options.synthesize.chairman,
      defaultConcurrency,
    );
    synthesizeOk = syn.ok;
    synthesizeErrored = syn.errored;
  }

  const wallClockMs = performance.now() - started;

  console.log(
    `\nBatch ${runBatchId}: ${ok} ok, ${errored} run errors, ` +
      `${judgeErrored} judge errors, ${peerRankOk} peer-rank ok, ` +
      `${peerRankErrored} peer-rank errors, ${synthesizeOk} synthesize ok, ` +
      `${synthesizeErrored} synthesize errors, ${Math.round(wallClockMs)}ms`,
  );
  for (const [modelId, avg] of Object.entries(avgScoreByModel)) {
    console.log(`  ${modelId}: avg score ${avg.toFixed(2)}`);
  }

  return {
    runBatchId,
    experimentId,
    ok,
    errored,
    judgeErrored,
    peerRankOk,
    peerRankErrored,
    synthesizeOk,
    synthesizeErrored,
    avgScoreByModel,
    wallClockMs,
  };
}
