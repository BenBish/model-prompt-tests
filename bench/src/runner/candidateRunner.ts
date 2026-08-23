import type { ModelAdapter, ModelPricing } from "../providers/types";
import type { PromptDefinition } from "../types";
import type { ModelIdentity } from "../experiment/manifest";
import type { ModelMatrixEntry } from "../providers/types";

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
  manifestIdentity?: ModelIdentity;
  run(prompt: PromptDefinition): Promise<CandidateRunResult>;
}

export function candidateRunnerFromAdapter(
  id: string,
  adapter: ModelAdapter,
  maxConcurrent?: number,
  pricing?: ModelPricing,
  config?: ModelMatrixEntry,
): CandidateRunner {
  return {
    id,
    providerId: adapter.providerId,
    modelName: adapter.modelName,
    maxConcurrent,
    pricing,
    manifestIdentity: config ? {
      id, provider: adapter.providerId, model: adapter.modelName,
      generation: { maxTokens: config.maxTokens, timeoutMs: config.timeoutMs, reasoningEffort: config.kind === "openai-compatible" ? config.reasoningEffort : undefined },
      backend: config.kind === "openai-compatible" ? config.providerId : "anthropic",
      immutableRevision: config.immutableRevision ?? (/^(local|lab-candidate)(:|$)/i.test(id) ? undefined : adapter.modelName),
      weightsSha256: config.weightsSha256,
      quantization: config.quantization,
    } : undefined,
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
