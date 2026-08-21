import type { Database } from "bun:sqlite";
import type { ModelAdapter } from "../providers/types";
import { insertRun } from "../db/runsRepo";
import { insertToolProbeResult } from "../db/toolProbeResultsRepo";
import { createLimiter } from "../util/concurrency";
import { scoreToolProbeCase } from "./scoreToolCall";
import { TOOL_PROBE_CASES, type ToolProbeCase } from "./toolCases";

export interface ToolProbeCandidate {
  modelId: string;
  providerId: string;
  adapter: ModelAdapter;
  maxConcurrent?: number;
}

export interface ToolProbeCandidateSummary {
  modelId: string;
  cases: number;
  errors: number;
  wellFormedRate: number;
  correctToolRate: number;
  validArgsRate: number;
  avgLatencyMs?: number;
}

export interface RunToolProbeOptions {
  db: Database;
  candidates: ToolProbeCandidate[];
  cases?: ToolProbeCase[];
  defaultConcurrency?: number;
}

export interface RunToolProbeSummary {
  runBatchId: string;
  candidateSummaries: ToolProbeCandidateSummary[];
}

const DEFAULT_CONCURRENCY = 1;

function makeRunBatchId(): string {
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${now}-${suffix}`;
}

export async function runToolProbe(options: RunToolProbeOptions): Promise<RunToolProbeSummary> {
  const { db, candidates } = options;
  const cases = options.cases ?? TOOL_PROBE_CASES;
  const defaultConcurrency = options.defaultConcurrency ?? DEFAULT_CONCURRENCY;
  const runBatchId = makeRunBatchId();

  const summaries: ToolProbeCandidateSummary[] = [];

  for (const candidate of candidates) {
    const limiter = createLimiter(Math.min(defaultConcurrency, candidate.maxConcurrent ?? defaultConcurrency));
    let errors = 0;
    let wellFormed = 0;
    let correctTool = 0;
    let validArgs = 0;
    const latencies: number[] = [];

    await Promise.all(
      cases.map((testCase) =>
        limiter(async () => {
          const startedAt = new Date().toISOString();
          const promptId = `hermes-tools/${testCase.id}`;
          try {
            const result = await candidate.adapter.call({
              userPrompt: testCase.userMessage,
              tools: testCase.tools,
              toolChoice: "auto",
            });
            const score = scoreToolProbeCase(result.toolCalls, testCase);

            const runId = insertRun(db, {
              runBatchId,
              promptId,
              providerId: candidate.providerId,
              modelId: candidate.modelId,
              modelName: candidate.adapter.modelName,
              startedAt,
              latencyMs: Math.round(result.latencyMs),
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              outputText: result.text,
              rawResponse: JSON.stringify(result.raw),
              status: "ok",
              kind: "prompt",
              stopReason: result.stopReason,
              costUsd: result.costUsd,
            });
            insertToolProbeResult(db, {
              runId,
              caseId: testCase.id,
              expectedTool: testCase.expect.toolName,
              wellFormed: score.wellFormed,
              correctTool: score.correctTool,
              validArgs: score.validArgs,
              calledTool: score.calledTool,
              argumentsRaw: score.argumentsRaw,
              notes: score.notes,
            });

            if (score.wellFormed) wellFormed++;
            if (score.correctTool) correctTool++;
            if (score.validArgs) validArgs++;
            latencies.push(result.latencyMs);

            const label = score.correctTool ? (score.validArgs ? "pass" : "partial") : "fail";
            console.log(`[${label}] ${promptId} x ${candidate.modelId} (${Math.round(result.latencyMs)}ms)`);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            insertRun(db, {
              runBatchId,
              promptId,
              providerId: candidate.providerId,
              modelId: candidate.modelId,
              modelName: candidate.adapter.modelName,
              startedAt,
              status: "error",
              error: message,
              kind: "prompt",
            });
            errors++;
            console.log(`[error] ${promptId} x ${candidate.modelId}: ${message}`);
          }
        }),
      ),
    );

    const scored = cases.length - errors;
    summaries.push({
      modelId: candidate.modelId,
      cases: cases.length,
      errors,
      wellFormedRate: scored > 0 ? wellFormed / scored : 0,
      correctToolRate: scored > 0 ? correctTool / scored : 0,
      validArgsRate: scored > 0 ? validArgs / scored : 0,
      avgLatencyMs: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : undefined,
    });
  }

  return { runBatchId, candidateSummaries: summaries };
}
