import { buildDimensionalCorrectiveMessage, validateDimensionalResult, type DimensionalResult } from "../judge/dimensionalScoring";
import { runStructuredLlmCall } from "../judge/structuredCall";
import type { ModelAdapter } from "../providers/types";
import { buildSweJudgeSystemPrompt, buildSweJudgeUserPrompt } from "./buildSweJudgePrompt";
import type { SweTask } from "./taskSpec";
import type { VerifyResult } from "./workspace";

export type SweJudgeResult = DimensionalResult;

export interface SweJudgeOutcome {
  result: SweJudgeResult | null;
  rawJudgeText: string;
  error?: string;
}

export interface RunSweJudgeOptions {
  retry?: {
    attempts?: number;
    baseDelayMs?: number;
  };
}

export async function runSweJudge(
  judgeAdapter: ModelAdapter,
  task: SweTask,
  diff: string,
  verify: VerifyResult | undefined,
  agentFinalMessage: string,
  options: RunSweJudgeOptions = {},
): Promise<SweJudgeOutcome> {
  const systemPrompt = buildSweJudgeSystemPrompt(task);
  const userPrompt = buildSweJudgeUserPrompt(task, diff, verify, agentFinalMessage);
  const correctiveMessage = buildDimensionalCorrectiveMessage(task.dimensions);

  const outcome = await runStructuredLlmCall(
    judgeAdapter,
    systemPrompt,
    userPrompt,
    validateDimensionalResult(task.dimensions),
    correctiveMessage,
    {
      retry: options.retry,
      requestErrorPrefix: "swe judge request failed",
      exhaustedErrorMessage: () => "swe judge did not return a valid JSON score after 2 attempts",
    },
  );

  return { result: outcome.result, rawJudgeText: outcome.rawText, error: outcome.error };
}
