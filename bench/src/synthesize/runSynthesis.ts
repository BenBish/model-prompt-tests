import type { ModelAdapter, ModelPricing } from "../providers/types";
import { extractFirstJsonObject } from "../judge/structuredCall";
import { withRetry } from "../util/retry";
import {
  buildSynthesisSystemPrompt,
  buildSynthesisUserPrompt,
  synthesisJsonSchema,
  validateSynthesisResult,
  type SynthesisPeer,
} from "./buildPrompt";

export interface Chairman {
  adapter: ModelAdapter;
  modelId: string;
  maxConcurrent?: number;
  pricing?: ModelPricing;
}

export interface SynthesisCallOk {
  status: "ok";
  chairmanModelId: string;
  synthesisText: string;
  usedModelIds: string[];
  notes: string;
  candidateModelIds: string[];
  peerRankOrder?: string[];
  rawOutput: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export interface SynthesisCallError {
  status: "error";
  chairmanModelId: string;
  candidateModelIds: string[];
  peerRankOrder?: string[];
  error: string;
  rawOutput: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export type SynthesisCallResult = SynthesisCallOk | SynthesisCallError;

function resolveCostUsd(
  pricing: ModelPricing | undefined,
  result: { costUsd?: number; inputTokens?: number; outputTokens?: number },
): number | undefined {
  if (result.costUsd !== undefined) return result.costUsd;
  if (!pricing) return undefined;
  if (result.inputTokens === undefined || result.outputTokens === undefined) return undefined;
  return (
    (result.inputTokens * pricing.inputPerMTok + result.outputTokens * pricing.outputPerMTok) /
    1_000_000
  );
}

export async function runOneSynthesis(
  chairman: Chairman,
  originalPromptText: string,
  peers: SynthesisPeer[],
  peerRankOrder?: string[],
): Promise<SynthesisCallResult> {
  const candidateModelIds = peers.map((p) => p.modelId);
  const systemPrompt = buildSynthesisSystemPrompt();
  const userPrompt = buildSynthesisUserPrompt(originalPromptText, peers, peerRankOrder);
  const jsonSchema = synthesisJsonSchema();

  try {
    const response = await withRetry(() =>
      chairman.adapter.call({
        systemPrompt,
        userPrompt,
        temperature: 0,
        jsonSchema,
      }),
    );

    let rawOutput = response.text;
    let latencyMs = response.latencyMs;
    let inputTokens = response.inputTokens;
    let outputTokens = response.outputTokens;
    let costUsd = resolveCostUsd(chairman.pricing, response);

    let parsed = extractFirstJsonObject(response.text);
    let validated = parsed ? validateSynthesisResult(parsed, candidateModelIds) : undefined;

    if (!validated) {
      const corrective = await withRetry(() =>
        chairman.adapter.call({
          systemPrompt,
          userPrompt:
            userPrompt +
            "\n\nYour previous response was invalid. Return ONLY a JSON object with " +
            '"answer" (non-empty string) and "provenance": { "usedModelIds": string[], "notes": string }.',
          temperature: 0,
        }),
      );
      rawOutput = corrective.text;
      latencyMs += corrective.latencyMs;
      if (corrective.inputTokens !== undefined) {
        inputTokens = (inputTokens ?? 0) + corrective.inputTokens;
      }
      if (corrective.outputTokens !== undefined) {
        outputTokens = (outputTokens ?? 0) + corrective.outputTokens;
      }
      const correctiveCost = resolveCostUsd(chairman.pricing, corrective);
      if (costUsd !== undefined || correctiveCost !== undefined) {
        costUsd = (costUsd ?? 0) + (correctiveCost ?? 0);
      }
      parsed = extractFirstJsonObject(corrective.text);
      validated = parsed ? validateSynthesisResult(parsed, candidateModelIds) : undefined;
    }

    if (!validated) {
      return {
        status: "error",
        chairmanModelId: chairman.modelId,
        candidateModelIds,
        peerRankOrder,
        error: "chairman did not return a valid synthesis JSON object",
        rawOutput,
        latencyMs: Math.round(latencyMs),
        inputTokens,
        outputTokens,
        costUsd,
      };
    }

    return {
      status: "ok",
      chairmanModelId: chairman.modelId,
      synthesisText: validated.answer,
      usedModelIds: validated.usedModelIds,
      notes: validated.notes,
      candidateModelIds,
      peerRankOrder,
      rawOutput,
      latencyMs: Math.round(latencyMs),
      inputTokens,
      outputTokens,
      costUsd,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "error",
      chairmanModelId: chairman.modelId,
      candidateModelIds,
      peerRankOrder,
      error: message,
      rawOutput: "",
    };
  }
}

export function provenanceJson(result: SynthesisCallResult): string {
  return JSON.stringify({
    candidateModelIds: result.candidateModelIds,
    peerRankOrder: result.peerRankOrder ?? null,
    usedModelIds: result.status === "ok" ? result.usedModelIds : [],
    notes: result.status === "ok" ? result.notes : undefined,
  });
}
