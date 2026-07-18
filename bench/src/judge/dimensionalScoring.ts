import type { RubricDimension } from "../types";

export interface DimensionScore {
  score: number;
  rationale: string;
}

export interface DimensionalResult {
  score: 1 | 2 | 3 | 4 | 5;
  rationale: string;
  dimensions?: Record<string, DimensionScore>;
  weightedScore?: number;
}

/**
 * Validates a judge's raw JSON reply against the holistic {score, rationale} shape, and — when
 * `dimensions` is non-empty — additionally requires a "dimensions" object covering exactly those
 * ids, computing a weighted score alongside the holistic one. Shared by the prompt judge
 * (judge/judge.ts) and the SWE task judge so both dimensional-scoring contracts stay identical.
 */
export function validateDimensionalResult(
  dimensions: RubricDimension[] | undefined,
): (parsed: unknown) => DimensionalResult | undefined {
  return (parsed: unknown): DimensionalResult | undefined => {
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

    if (!dimensions || dimensions.length === 0) {
      return { score: score as DimensionalResult["score"], rationale };
    }

    const rawDimensions = obj.dimensions;
    if (typeof rawDimensions !== "object" || rawDimensions === null) return undefined;
    const dimensionsObj = rawDimensions as Record<string, unknown>;

    const parsedDimensions: Record<string, DimensionScore> = {};
    for (const dim of dimensions) {
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

    const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
    const weightedScore =
      dimensions.reduce((sum, d) => sum + d.weight * parsedDimensions[d.id]!.score, 0) / totalWeight;

    return {
      score: score as DimensionalResult["score"],
      rationale,
      dimensions: parsedDimensions,
      weightedScore,
    };
  };
}

export function buildDimensionalCorrectiveMessage(dimensions: RubricDimension[] | undefined): string {
  if (!dimensions || dimensions.length === 0) {
    return (
      "Your previous reply was not valid JSON matching the required schema. " +
      'Reply with ONLY the JSON object: {"score": <integer 1-5>, "rationale": "<string>"}'
    );
  }
  const dimensionIds = dimensions.map((d) => d.id).join(", ");
  return (
    "Your previous reply was not valid JSON matching the required schema, or was missing a required " +
    `dimension. Reply with ONLY a JSON object containing "score" (integer 1-5), "rationale" (string), ` +
    `and a "dimensions" object covering exactly these ids, each with an integer 1-5 "score" and a "rationale": ${dimensionIds}.`
  );
}
