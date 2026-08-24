import type { Database } from "bun:sqlite";
import { verifierEnvironmentFingerprint } from "./taskHealth";
import { dirname, join } from "node:path";
import type { ModelAdapter } from "../providers/types";
import { insertRun } from "../db/runsRepo";
import { insertScore } from "../db/scoresRepo";
import { insertSweResult } from "../db/sweResultsRepo";
import { createLimiter, type Limiter } from "../util/concurrency";
import { runSweJudge } from "./sweJudge";
import type { SweHarness } from "./harness/types";
import type { CodeReviewSweTask, ExternalSweTask, FixtureSweTask, SweTask } from "./taskSpec";
import {
  prepareExternalVerify,
  provisionExternalWorkspace,
  removeExternalWorktree,
  type ProvisionedExternalWorkspace,
} from "./externalWorkspace";
import { loadFindingsSpec } from "./findings";
import { runReviewMatcher } from "./reviewMatcher";
import { diffLlamaCppMetrics, sampleLlamaCppMetrics } from "./llamaCppMetrics";
import { provisionCodeReviewWorkspace } from "./reviewWorkspace";
import { insertExperiment } from "../db/experimentsRepo";
import { EXPERIMENT_SCHEMA_VERSION, fingerprintEnvironment, repositoryState, sha256 } from "../experiment/manifest";
import {
  captureDiff,
  cleanupWorkspace,
  overlayHiddenTests,
  provisionFixtureWorkspace,
  runVerify,
  workspaceDirFor,
  type ProvisionedWorkspace,
  type VerifyResult,
} from "./workspace";

export interface SweRunnerCell {
  harnessId: string;
  harness: SweHarness;
  modelAlias: string;
  maxConcurrency?: number;
  /** llama.cpp server base URL to sample /metrics around each cell for throughput. */
  metricsUrl?: string;
}

export interface RunSweBatchOptions {
  db: Database;
  tasks: SweTask[];
  cells: SweRunnerCell[];
  workspacesRoot: string;
  /** Root for blob-less git clones of external tasks. Default: sibling of workspacesRoot named repo-cache. */
  repoCacheRoot?: string;
  repeats?: number;
  defaultConcurrency?: number;
  keepWorkspaces?: boolean;
  judges?: {
    adapter: ModelAdapter;
    modelId: string;
    maxConcurrent?: number;
  }[];
}

export interface RunSweBatchSummary {
  runBatchId: string;
  experimentId: string;
  ok: number;
  errored: number;
  passed: number;
  failed: number;
  judgeErrored: number;
  wallClockMs: number;
}

const DEFAULT_CONCURRENCY = 1;

function makeRunBatchId(): string {
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${now}-${suffix}`;
}

/**
 * Place the blob-less clone cache next to the workspaces root when the path ends in
 * `workspaces`, otherwise under a `repo-cache` sibling of the given directory. Never reuses
 * the workspaces path itself (that would mix cell dirs with bare clones).
 */
export function defaultRepoCacheRoot(workspacesRoot: string): string {
  const normalized = workspacesRoot.replace(/\/+$/, "");
  // Match a final path segment of exactly "workspaces", not suffixes like "myworkspaces".
  const base = /(^|\/)workspaces$/.test(normalized) ? dirname(normalized) : normalized;
  return join(base, "repo-cache");
}

export async function runSweBatch(options: RunSweBatchOptions): Promise<RunSweBatchSummary> {
  const { db, tasks, cells, workspacesRoot } = options;
  const repoCacheRoot = options.repoCacheRoot ?? defaultRepoCacheRoot(workspacesRoot);
  const repeats = options.repeats ?? 1;
  const defaultConcurrency = options.defaultConcurrency ?? DEFAULT_CONCURRENCY;
  const judges = options.judges ?? [];
  const started = performance.now();
  const runBatchId = makeRunBatchId();
  const createdAt = new Date().toISOString();
  const experimentId = insertExperiment(db, {
    schemaVersion: EXPERIMENT_SCHEMA_VERSION, createdAt, suite: { id: "model-prompt-tests-swe", version: "1" }, repository: repositoryState(process.cwd()),
    tasks: tasks.map((task) => ({ id: task.id, sha256: sha256(JSON.stringify(task)) })).sort((a, b) => a.id.localeCompare(b.id)),
    models: cells.map((cell) => ({ id: `${cell.harnessId}:${cell.modelAlias}`, provider: cell.harnessId, model: cell.modelAlias, immutableRevision: cell.harness.resolveModel(cell.modelAlias) })),
    judges: judges.map((judge) => ({ id: judge.modelId, modelId: judge.modelId, sha256: sha256(judge.modelId) })), harness: { id: "swe", version: "1", config: { workspacesRoot, concurrency: defaultConcurrency } },
    prompts: {}, limits: {}, toolPermissions: ["workspace-write"], plannedRepeats: repeats, exclusions: [], environment: fingerprintEnvironment({ executionDomain: process.env.BENCH_EXECUTION_DOMAIN ?? "interactive-lab", concurrency: defaultConcurrency }),
  });

  let ok = 0;
  let errored = 0;
  let passed = 0;
  let failed = 0;
  let judgeErrored = 0;

  const harnessLimiters = new Map<string, Limiter>();
  function limiterFor(cell: SweRunnerCell): Limiter {
    const harnessId = cell.harnessId;
    let limiter = harnessLimiters.get(harnessId);
    if (!limiter) {
      limiter = createLimiter(Math.min(defaultConcurrency, cell.maxConcurrency ?? 1));
      harnessLimiters.set(harnessId, limiter);
    }
    return limiter;
  }

  const okRunIds: {
    runId: number;
    task: SweTask;
    diffPatch: string;
    verify: VerifyResult | undefined;
    finalMessage: string;
  }[] = [];

  const cellTasks: Promise<void>[] = [];
  for (const task of tasks) {
    if (task.type !== "fixture" && task.type !== "external" && task.type !== "code-review") {
      console.log(`[skip] ${(task as SweTask).id}: unsupported task type`);
      continue;
    }
    for (const cell of cells) {
      for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex++) {
        const limiter = limiterFor(cell);
        cellTasks.push(limiter(() => executeCell(task, cell, repeatIndex)));
      }
    }
  }

  async function executeCell(task: SweTask, cell: SweRunnerCell, repeatIndex: number): Promise<void> {
    const healthValidated = task.lifecycle === "active" &&
      task.healthEnvironmentFingerprint === verifierEnvironmentFingerprint() &&
      typeof task.healthValidatedAt === "string";
    const startedAt = new Date().toISOString();
    const modelId = `${cell.harnessId}:${cell.modelAlias}`;
    const label = `${task.id} x ${modelId}${repeats > 1 ? ` (repeat ${repeatIndex + 1}/${repeats})` : ""}`;
    const workspaceDir = workspaceDirFor(
      workspacesRoot,
      runBatchId,
      task.id,
      cell.harnessId,
      cell.modelAlias,
      repeatIndex,
    );

    const nativeModel = cell.harness.resolveModel(cell.modelAlias);
    if (!nativeModel) {
      const message = `model alias "${cell.modelAlias}" is not resolved by harness "${cell.harnessId}"`;
      insertRun(db, {
        runBatchId,
        promptId: task.id,
        providerId: cell.harnessId,
        modelId,
        modelName: cell.modelAlias,
        startedAt,
        status: "error",
        error: message,
        repeatIndex,
        kind: "swe",
        harnessId: cell.harnessId,
        experimentId,
      });
      errored++;
      console.log(`[error] ${label}: ${message}`);
      return;
    }

    let externalMeta: ProvisionedExternalWorkspace | undefined;

    try {
      if (task.type === "code-review") {
        await executeCodeReviewCell(task, cell, repeatIndex, {
          startedAt,
          modelId,
          nativeModel,
          label,
          workspaceDir,
        });
        return;
      }

      let provisioned: ProvisionedWorkspace;
      if (task.type === "fixture") {
        provisioned = await provisionFixtureWorkspace(task, workspaceDir);
      } else {
        externalMeta = await provisionExternalWorkspace(task, workspaceDir, repoCacheRoot);
        provisioned = externalMeta;
      }

      const metricsBefore = cell.metricsUrl ? await sampleLlamaCppMetrics(cell.metricsUrl) : undefined;
      const agentResult = await cell.harness.run({
        taskPrompt: task.taskText,
        model: nativeModel,
        workDir: workspaceDir,
        timeoutMs: task.agentTimeoutMs,
      });
      const metricsAfter = cell.metricsUrl ? await sampleLlamaCppMetrics(cell.metricsUrl) : undefined;
      const metricsDelta = diffLlamaCppMetrics(metricsBefore, metricsAfter);
      const diff = await captureDiff(workspaceDir, provisioned.postSetupSha);

      if (task.type === "fixture") {
        await overlayHiddenTests(task, workspaceDir);
      } else {
        await prepareExternalVerify(task, workspaceDir);
      }
      const verify = await runVerify(task, workspaceDir);

      const runId = insertRun(db, {
        experimentId,
        runBatchId,
        promptId: task.id,
        providerId: cell.harnessId,
        modelId,
        modelName: nativeModel,
        startedAt,
        latencyMs: Math.round(agentResult.latencyMs),
        inputTokens: agentResult.inputTokens,
        outputTokens: agentResult.outputTokens,
        outputText: agentResult.finalMessage,
        rawResponse: JSON.stringify(agentResult.raw),
        status: "ok",
        repeatIndex,
        kind: "swe",
        harnessId: cell.harnessId,
        costUsd: agentResult.costUsd,
      });

      insertSweResult(db, {
        runId,
        taskType: task.type,
        workdir: workspaceDir,
        baselineSha: provisioned.baselineSha,
        diffPatch: diff.patch,
        filesChanged: diff.filesChanged,
        linesAdded: diff.linesAdded,
        linesRemoved: diff.linesRemoved,
        transcript: agentResult.transcript,
        agentExitCode: agentResult.exitCode,
        agentTimedOut: agentResult.timedOut,
        verifyCommand: verify.command,
        verifyExitCode: verify.exitCode,
        verifyPassed: verify.passed,
        verifyOutput: verify.output,
        verifyDurationMs: Math.round(verify.durationMs),
        verifyTestsPassed: verify.testsPassed,
        verifyTestsTotal: verify.testsTotal,
        verificationDetail: verify.detail,
        outcomeCategory: verify.timedOut
          ? "verifier_error"
          : agentResult.timedOut
            ? "timeout"
            : !agentResult.finalMessage.trim() && agentResult.exitCode !== 0
              ? "invalid_output"
              : verify.passed ? "passed" : "candidate_failure",
        serverPromptTokens: metricsDelta?.promptTokens,
        serverPromptSeconds: metricsDelta?.promptSeconds,
        serverPredictedTokens: metricsDelta?.predictedTokens,
        serverPredictedSeconds: metricsDelta?.predictedSeconds,
        taskLifecycle: task.lifecycle,
        graderVersion: task.graderVersion,
        healthStatus: healthValidated ? "healthy" : "unvalidated",
        environmentFingerprint: task.healthEnvironmentFingerprint ?? verifierEnvironmentFingerprint(),
        healthValidatedAt: task.healthValidatedAt,
        publicationStatus: healthValidated ? "comparable" : "quarantined",
      });

      ok++;
      if (verify.passed) passed++;
      else failed++;
      okRunIds.push({ runId, task, diffPatch: diff.patch, verify, finalMessage: agentResult.finalMessage });

      console.log(
        `[${verify.passed ? "pass" : "fail"}] ${label} (${Math.round(agentResult.latencyMs)}ms agent, verify ${verify.passed ? "passed" : "failed"})`,
      );

      if (!options.keepWorkspaces) {
        if (externalMeta) {
          await removeExternalWorktree(workspaceDir, externalMeta.cacheDir);
        } else {
          await cleanupWorkspace(workspaceDir);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const runId = insertRun(db, {
        experimentId,
        runBatchId,
        promptId: task.id,
        providerId: cell.harnessId,
        modelId,
        modelName: nativeModel,
        startedAt,
        status: "error",
        error: message,
        repeatIndex,
        kind: "swe",
        harnessId: cell.harnessId,
      });
      insertSweResult(db, {
        runId,
        taskType: task.type,
        error: message,
        outcomeCategory: "harness_error",
        taskLifecycle: task.lifecycle,
        graderVersion: task.graderVersion,
        publicationStatus: "quarantined",
      });
      errored++;
      console.log(`[error] ${label}: ${message}`);
    }
  }

  async function executeCodeReviewCell(
    task: CodeReviewSweTask,
    cell: SweRunnerCell,
    repeatIndex: number,
    ctx: {
      startedAt: string;
      modelId: string;
      nativeModel: string;
      label: string;
      workspaceDir: string;
    },
  ): Promise<void> {
    const { startedAt, modelId, nativeModel, label, workspaceDir } = ctx;
    const provisioned = await provisionCodeReviewWorkspace(task, workspaceDir);

    const metricsBefore = cell.metricsUrl ? await sampleLlamaCppMetrics(cell.metricsUrl) : undefined;
    const agentResult = await cell.harness.run({
      taskPrompt: provisioned.reviewPrompt,
      model: nativeModel,
      workDir: workspaceDir,
      timeoutMs: task.agentTimeoutMs,
      mode: "review",
    });
    const metricsAfter = cell.metricsUrl ? await sampleLlamaCppMetrics(cell.metricsUrl) : undefined;
    const metricsDelta = diffLlamaCppMetrics(metricsBefore, metricsAfter);

    // Matcher uses the primary qualitative judge when available. When a judge is configured,
    // a successful match is required — matcher failure marks the run as error (agent output
    // is still stored for debugging).
    const primaryJudge = judges[0];
    let reviewMetrics: unknown | undefined;
    let matcherError: string | undefined;
    if (primaryJudge) {
      const findingsSpec = await loadFindingsSpec(task.findingsPath);
      const matchOutcome = await runReviewMatcher(
        primaryJudge.adapter,
        findingsSpec,
        agentResult.finalMessage,
        provisioned.diffText,
        primaryJudge.modelId,
      );
      if (matchOutcome.metrics) {
        reviewMetrics = matchOutcome.metrics;
      } else {
        matcherError = matchOutcome.error ?? "matcher failed";
        judgeErrored++;
        console.log(`[matcher-error] ${label}: ${matcherError}`);
      }
    }

    const matcherRequiredAndFailed = Boolean(primaryJudge && matcherError);
    const runStatus = matcherRequiredAndFailed ? "error" : "ok";

    const runId = insertRun(db, {
      experimentId,
      runBatchId,
      promptId: task.id,
      providerId: cell.harnessId,
      modelId,
      modelName: nativeModel,
      startedAt,
      latencyMs: Math.round(agentResult.latencyMs),
      inputTokens: agentResult.inputTokens,
      outputTokens: agentResult.outputTokens,
      outputText: agentResult.finalMessage,
      rawResponse: JSON.stringify(agentResult.raw),
      status: runStatus,
      error: matcherError,
      repeatIndex,
      kind: "swe",
      harnessId: cell.harnessId,
      costUsd: agentResult.costUsd,
    });

    insertSweResult(db, {
      runId,
      taskType: "code-review",
      workdir: workspaceDir,
      baselineSha: provisioned.baselineSha,
      // Store the PR under review (not the agent's workspace delta).
      diffPatch: provisioned.diffText,
      filesChanged: undefined,
      linesAdded: undefined,
      linesRemoved: undefined,
      transcript: agentResult.transcript,
      agentExitCode: agentResult.exitCode,
      agentTimedOut: agentResult.timedOut,
      // No verify step for code-review; pass/fail is undefined.
      reviewMetrics,
      error: matcherError,
      outcomeCategory: matcherError ? "judge_error" : agentResult.timedOut ? "timeout" : "passed",
      serverPromptTokens: metricsDelta?.promptTokens,
      serverPromptSeconds: metricsDelta?.promptSeconds,
      serverPredictedTokens: metricsDelta?.predictedTokens,
      serverPredictedSeconds: metricsDelta?.predictedSeconds,
    });

    if (matcherRequiredAndFailed) {
      errored++;
      // Keep workspace on matcher failure for debugging (same as other errors).
      console.log(`[error] ${label}: matcher required but failed: ${matcherError}`);
      return;
    }

    ok++;
    // Code-review has no verify pass/fail; do not increment passed/failed.
    // Console summary reports review F1 separately when present.
    okRunIds.push({
      runId,
      task,
      diffPatch: provisioned.diffText,
      verify: undefined,
      finalMessage: agentResult.finalMessage,
    });

    const f1 =
      reviewMetrics && typeof reviewMetrics === "object" && "f1" in reviewMetrics
        ? (reviewMetrics as { f1: number }).f1
        : undefined;
    console.log(
      `[review] ${label} (${Math.round(agentResult.latencyMs)}ms agent` +
        (f1 !== undefined ? `, F1 ${f1.toFixed(2)}` : ", no matcher") +
        `)`,
    );

    if (!options.keepWorkspaces) {
      await cleanupWorkspace(workspaceDir);
    }
  }

  await Promise.all(cellTasks);

  if (judges.length > 0) {
    const judgeLimiters = new Map(
      judges.map((judge) => [judge.modelId, createLimiter(judge.maxConcurrent ?? defaultConcurrency)]),
    );
    const judgeTasks = okRunIds.flatMap(({ runId, task, diffPatch, verify, finalMessage }) =>
      judges.map((judge) =>
        judgeLimiters.get(judge.modelId)!(async () => {
          const outcome = await runSweJudge(judge.adapter, task, diffPatch, verify, finalMessage);
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
          if (!outcome.result) {
            judgeErrored++;
            console.log(`[judge-error] ${task.id} judged by ${judge.modelId}: ${outcome.error}`);
          }
        }),
      ),
    );
    await Promise.all(judgeTasks);
  }

  const wallClockMs = performance.now() - started;
  // For pure code-review batches, pass/fail stay 0 (no verify). Call that out so the summary
  // does not look like a no-op.
  const reviewOnlyNote =
    passed === 0 && failed === 0 && ok > 0
      ? " (code-review cells have no verify pass/fail; see F1 in per-cell logs / report)"
      : "";
  const noJudgeNote = judges.length === 0 && ok > 0 ? " — no judges ran; use --judge/--judges to score quality" : "";
  console.log(
    `\nSWE batch ${runBatchId}: ${ok} ok (${passed} passed, ${failed} failed)${reviewOnlyNote}, ${errored} errors, ` +
      `${judgeErrored} judge errors, ${Math.round(wallClockMs)}ms${noJudgeNote}`,
  );

  return { runBatchId, experimentId, ok, errored, passed, failed, judgeErrored, wallClockMs };
}
