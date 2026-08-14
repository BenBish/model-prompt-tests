import type { ModelAdapter, ModelPricing } from "../providers/types";
import { extractFirstJsonObject, looksLikeUnsupportedStructuredOutput } from "../judge/structuredCall";
import { withRetry } from "../util/retry";
import { anonymizePeers, deanonymizeRanking } from "./anonymize";
import {
  buildPeerRankSystemPrompt,
  buildPeerRankUserPrompt,
  peerRankJsonSchema,
} from "./buildPeerRankPrompt";
import { validatePeerRankResult } from "./validateRanking";

export interface PeerRanker {
  adapter: ModelAdapter;
  modelId: string;
  maxConcurrent?: number;
  pricing?: ModelPricing;
}

export interface PeerCandidate {
  modelId: string;
  outputText: string;
}

export interface PeerRankCallOk {
  status: "ok";
  rankerModelId: string;
  labelToModelId: Record<string, string>;
  rankingLabels: string[];
  rankingModelIds: string[];
  rationale: string;
  rawOutput: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export interface PeerRankCallError {
  status: "error";
  rankerModelId: string;
  labelToModelId: Record<string, string>;
  error: string;
  rawOutput: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export type PeerRankCallResult = PeerRankCallOk | PeerRankCallError;

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

/**
 * Run a single anonymized peer-ranking call for one ranker against a candidate set.
 */
export async function runOnePeerRank(
  ranker: PeerRanker,
  originalPromptText: string,
  candidates: PeerCandidate[],
  random: () => number = Math.random,
): Promise<PeerRankCallResult> {
  const { labelToModelId, peers } = anonymizePeers(candidates, random);
  const labels = peers.map((p) => p.label);
  const systemPrompt = buildPeerRankSystemPrompt();
  const userPrompt = buildPeerRankUserPrompt(originalPromptText, peers);
  const jsonSchema = peerRankJsonSchema(labels);

  try {
    let response;
    try {
      response = await withRetry(() =>
        ranker.adapter.call({
          systemPrompt,
          userPrompt,
          temperature: 0,
          jsonSchema,
        }),
      );
    } catch (err) {
      if (!looksLikeUnsupportedStructuredOutput(err)) throw err;
      // DeepSeek V4 Pro (and some other providers) reject response_format json_schema.
      response = await withRetry(() =>
        ranker.adapter.call({
          systemPrompt,
          userPrompt,
          temperature: 0,
        }),
      );
    }

    const parsed = extractFirstJsonObject(response.text);
    let validated = parsed ? validatePeerRankResult(parsed, labels) : undefined;

    // One corrective plain-text retry if structured output was invalid
    let rawOutput = response.text;
    let latencyMs = response.latencyMs;
    let inputTokens = response.inputTokens;
    let outputTokens = response.outputTokens;
    let costUsd = resolveCostUsd(ranker.pricing, response);

    if (!validated) {
      const corrective = await withRetry(() =>
        ranker.adapter.call({
          systemPrompt,
          userPrompt:
            userPrompt +
            "\n\nYour previous response was invalid. Return ONLY a JSON object " +
            `with "ranking" (permutation of [${labels.map((l) => `"${l}"`).join(", ")}], best first) ` +
            'and "rationale" (non-empty string).',
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
      const correctiveCost = resolveCostUsd(ranker.pricing, corrective);
      if (costUsd !== undefined || correctiveCost !== undefined) {
        costUsd = (costUsd ?? 0) + (correctiveCost ?? 0);
      }
      const parsed2 = extractFirstJsonObject(corrective.text);
      validated = parsed2 ? validatePeerRankResult(parsed2, labels) : undefined;
    }

    if (!validated) {
      return {
        status: "error",
        rankerModelId: ranker.modelId,
        labelToModelId,
        error: "ranker did not return a valid permutation ranking",
        rawOutput,
        latencyMs: Math.round(latencyMs),
        inputTokens,
        outputTokens,
        costUsd,
      };
    }

    return {
      status: "ok",
      rankerModelId: ranker.modelId,
      labelToModelId,
      rankingLabels: validated.ranking,
      rankingModelIds: deanonymizeRanking(validated.ranking, labelToModelId),
      rationale: validated.rationale,
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
      rankerModelId: ranker.modelId,
      labelToModelId,
      error: message,
      rawOutput: "",
    };
  }
}
