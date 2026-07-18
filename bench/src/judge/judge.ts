import type { ModelAdapter } from "../providers/types";
import type { PromptDefinition } from "../types";
import { buildJudgeSystemPrompt, buildJudgeUserPrompt } from "./buildJudgePrompt";
import {
  buildDimensionalCorrectiveMessage,
  validateDimensionalResult,
  type DimensionScore,
  type DimensionalResult,
} from "./dimensionalScoring";
import { runStructuredLlmCall } from "./structuredCall";

export type JudgeDimensionScore = DimensionScore;
export type JudgeResult = DimensionalResult;

export interface JudgeOutcome {
  result: JudgeResult | null;
  rawJudgeText: string;
  error?: string;
}

export interface RunJudgeOptions {
  retry?: {
    attempts?: number;
    baseDelayMs?: number;
  };
}

export async function runJudge(
  judgeAdapter: ModelAdapter,
  prompt: PromptDefinition,
  candidateOutput: string,
  options: RunJudgeOptions = {},
): Promise<JudgeOutcome> {
  const systemPrompt = buildJudgeSystemPrompt(prompt);
  const userPrompt = buildJudgeUserPrompt(prompt, candidateOutput);
  const correctiveMessage = buildDimensionalCorrectiveMessage(prompt.dimensions);

  const outcome = await runStructuredLlmCall(
    judgeAdapter,
    systemPrompt,
    userPrompt,
    validateDimensionalResult(prompt.dimensions),
    correctiveMessage,
    {
      retry: options.retry,
      requestErrorPrefix: "judge request failed",
      exhaustedErrorMessage: () => "judge did not return a valid JSON score after 2 attempts",
    },
  );

  return { result: outcome.result, rawJudgeText: outcome.rawText, error: outcome.error };
}
