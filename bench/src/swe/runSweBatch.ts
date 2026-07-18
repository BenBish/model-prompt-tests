import type { Database } from "bun:sqlite";
import type { ModelAdapter } from "../providers/types";
import { insertRun } from "../db/runsRepo";
import { insertScore } from "../db/scoresRepo";
import { insertSweResult } from "../db/sweResultsRepo";
import { createLimiter, type Limiter } from "../util/concurrency";
import { runSweJudge } from "./sweJudge";
import type { SweHarness } from "./harness/types";
import type { SweTask } from "./taskSpec";
import { captureDiff, cleanupWorkspace, overlayHiddenTests, provisionFixtureWorkspace, runVerify, workspaceDirFor } from "./workspace";

export interface SweRunnerCell {
  harnessId: string;
  harness: SweHarness;
  modelAlias: string;
}

export interface RunSweBatchOptions {
  db: Database;
  tasks: SweTask[];
  cells: SweRunnerCell[];
  workspacesRoot: string;
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
  ok: number;
  errored: number;
  passed: number;
  failed: number;
  judgeErrored: number;
  wallClockMs: number;
}

const DEFAULT_CONCURRENCY = 2;

function makeRunBatchId(): string {
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${now}-${suffix}`;
}

export async function runSweBatch(options: RunSweBatchOptions): Promise<RunSweBatchSummary> {
  const { db, tasks, cells, workspacesRoot } = options;
  const repeats = options.repeats ?? 1;
  const defaultConcurrency = options.defaultConcurrency ?? DEFAULT_CONCURRENCY;
  const judges = options.judges ?? [];
  const started = performance.now();
  const runBatchId = makeRunBatchId();

  let ok = 0;
  let errored = 0;
  let passed = 0;
  let failed = 0;
  let judgeErrored = 0;

  const harnessLimiters = new Map<string, Limiter>();
  function limiterFor(harnessId: string): Limiter {
    let limiter = harnessLimiters.get(harnessId);
    if (!limiter) {
      limiter = createLimiter(defaultConcurrency);
      harnessLimiters.set(harnessId, limiter);
    }
    return limiter;
  }

  const okRunIds: { runId: number; task: SweTask; diffPatch: string; verify: Awaited<ReturnType<typeof runVerify>> | undefined; finalMessage: string }[] = [];

  const cellTasks: Promise<void>[] = [];
  for (const task of tasks) {
    if (task.type !== "fixture") {
      console.log(`[skip] ${task.id}: only fixture tasks are runnable in this version`);
      continue;
    }
    for (const cell of cells) {
      for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex++) {
        const limiter = limiterFor(cell.harnessId);
        cellTasks.push(limiter(() => executeCell(task, cell, repeatIndex)));
      }
    }
  }

  async function executeCell(task: SweTask, cell: SweRunnerCell, repeatIndex: number): Promise<void> {
    if (task.type !== "fixture") return;
    const startedAt = new Date().toISOString();
    const modelId = `${cell.harnessId}:${cell.modelAlias}`;
    const label = `${task.id} x ${modelId}${repeats > 1 ? ` (repeat ${repeatIndex + 1}/${repeats})` : ""}`;
    const workspaceDir = workspaceDirFor(workspacesRoot, runBatchId, task.id, cell.harnessId, cell.modelAlias, repeatIndex);

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
      });
      errored++;
      console.log(`[error] ${label}: ${message}`);
      return;
    }

    try {
      const provisioned = await provisionFixtureWorkspace(task, workspaceDir);
      const agentResult = await cell.harness.run({
        taskPrompt: task.taskText,
        model: nativeModel,
        workDir: workspaceDir,
        timeoutMs: task.agentTimeoutMs,
      });
      const diff = await captureDiff(workspaceDir, provisioned.postSetupSha);
      await overlayHiddenTests(task, workspaceDir);
      const verify = await runVerify(task, workspaceDir);

      const runId = insertRun(db, {
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
      });

      ok++;
      if (verify.passed) passed++;
      else failed++;
      okRunIds.push({ runId, task, diffPatch: diff.patch, verify, finalMessage: agentResult.finalMessage });

      console.log(
        `[${verify.passed ? "pass" : "fail"}] ${label} (${Math.round(agentResult.latencyMs)}ms agent, verify ${verify.passed ? "passed" : "failed"})`,
      );

      if (!options.keepWorkspaces) {
        await cleanupWorkspace(workspaceDir);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      insertRun(db, {
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
      errored++;
      console.log(`[error] ${label}: ${message}`);
      // Workspaces from a harness/verification failure are always kept for debugging.
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
  console.log(
    `\nSWE batch ${runBatchId}: ${ok} ok (${passed} passed, ${failed} failed), ${errored} errors, ` +
      `${judgeErrored} judge errors, ${Math.round(wallClockMs)}ms`,
  );

  return { runBatchId, ok, errored, passed, failed, judgeErrored, wallClockMs };
}
