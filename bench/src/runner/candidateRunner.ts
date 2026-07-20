import type { ModelAdapter, ModelPricing } from "../providers/types";
import type { PromptDefinition } from "../types";

export interface CandidateRunResult {
  outputText: string;
  raw: unknown;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  stopReason?: string;
  costUsd?: number;
}

export interface CandidateRunner {
  id: string;
  providerId: string;
  modelName: string;
  maxConcurrent?: number;
  pricing?: ModelPricing;
  run(prompt: PromptDefinition): Promise<CandidateRunResult>;
}

export function candidateRunnerFromAdapter(
  id: string,
  adapter: ModelAdapter,
  maxConcurrent?: number,
  pricing?: ModelPricing,
): CandidateRunner {
  return {
    id,
    providerId: adapter.providerId,
    modelName: adapter.modelName,
    maxConcurrent,
    pricing,
    async run(prompt: PromptDefinition): Promise<CandidateRunResult> {
      const result = await adapter.call({ userPrompt: prompt.promptText });
      return {
        outputText: result.text,
        raw: result.raw,
        latencyMs: result.latencyMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        stopReason: result.stopReason,
        costUsd: result.costUsd,
      };
    },
  };
}
