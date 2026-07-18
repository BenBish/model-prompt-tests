import type { ModelAdapter } from "../providers/types";
import type { PromptDefinition } from "../types";
import { runStructuredLlmCall } from "./structuredCall";
import { buildJudgeSystemPrompt, buildJudgeUserPrompt } from "./buildJudgePrompt";

export interface JudgeDimensionScore {
  score: number;
  rationale: string;
}

export interface JudgeResult {
  score: 1 | 2 | 3 | 4 | 5;
  rationale: string;
  dimensions?: Record<string, JudgeDimensionScore>;
  weightedScore?: number;
}

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

const CORRECTIVE_MESSAGE =
  "Your previous reply was not valid JSON matching the required schema. " +
  'Reply with ONLY the JSON object: {"score": <integer 1-5>, "rationale": "<string>"}';

function buildDimensionalCorrectiveMessage(prompt: PromptDefinition): string {
  const dimensionIds = (prompt.dimensions ?? []).map((d) => d.id).join(", ");
  return (
    "Your previous reply was not valid JSON matching the required schema, or was missing a required " +
    `dimension. Reply with ONLY a JSON object containing "score" (integer 1-5), "rationale" (string), ` +
    `and a "dimensions" object covering exactly these ids, each with an integer 1-5 "score" and a "rationale": ${dimensionIds}.`
  );
}

function validateJudgeResult(prompt: PromptDefinition) {
  return (parsed: unknown): JudgeResult | undefined => {
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const obj = parsed as Record<string, unknown>;
    const score = obj.score;
    const rationale = obj.rationale;

    if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 5) {
      return undefined;
    }
    if (typeof rationale !== "string" || rationale.trim().length === 0) {
      return undefined;
    }

    const dims = prompt.dimensions;
    if (!dims || dims.length === 0) {
      return { score: score as JudgeResult["score"], rationale };
    }

    const rawDimensions = obj.dimensions;
    if (typeof rawDimensions !== "object" || rawDimensions === null) return undefined;
    const dimensionsObj = rawDimensions as Record<string, unknown>;

    const parsedDimensions: Record<string, JudgeDimensionScore> = {};
    for (const dim of dims) {
      const entry = dimensionsObj[dim.id];
      if (typeof entry !== "object" || entry === null) return undefined;
      const entryObj = entry as Record<string, unknown>;
      const dimScore = entryObj.score;
      const dimRationale = entryObj.rationale;
      if (
        typeof dimScore !== "number" ||
        !Number.isInteger(dimScore) ||
        dimScore < 1 ||
        dimScore > 5
      ) {
        return undefined;
      }
      if (typeof dimRationale !== "string" || dimRationale.trim().length === 0) return undefined;
      parsedDimensions[dim.id] = { score: dimScore, rationale: dimRationale };
    }

    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const weightedScore =
      dims.reduce((sum, d) => sum + d.weight * parsedDimensions[d.id]!.score, 0) / totalWeight;

    return {
      score: score as JudgeResult["score"],
      rationale,
      dimensions: parsedDimensions,
      weightedScore,
    };
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
  const hasDimensions = (prompt.dimensions?.length ?? 0) > 0;
  const correctiveMessage = hasDimensions
    ? buildDimensionalCorrectiveMessage(prompt)
    : CORRECTIVE_MESSAGE;

  const outcome = await runStructuredLlmCall(
    judgeAdapter,
    systemPrompt,
    userPrompt,
    validateJudgeResult(prompt),
    correctiveMessage,
    {
      retry: options.retry,
      requestErrorPrefix: "judge request failed",
      exhaustedErrorMessage: () => "judge did not return a valid JSON score after 2 attempts",
    },
  );

  return { result: outcome.result, rawJudgeText: outcome.rawText, error: outcome.error };
}
