export interface PeerRankResult {
  ranking: string[];
  rationale: string;
}

/**
 * Validate a parsed ranking object against the expected label set.
 * Ranking must be a permutation of labels (best-first).
 */
export function validatePeerRankResult(
  parsed: unknown,
  expectedLabels: string[],
): PeerRankResult | undefined {
  if (!parsed || typeof parsed !== "object") return undefined;
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.ranking) || typeof obj.rationale !== "string") return undefined;
  if (obj.rationale.trim().length === 0) return undefined;

  const ranking = obj.ranking;
  if (ranking.length !== expectedLabels.length) return undefined;
  if (!ranking.every((x) => typeof x === "string")) return undefined;

  const expected = new Set(expectedLabels);
  const seen = new Set<string>();
  for (const label of ranking) {
    if (!expected.has(label) || seen.has(label)) return undefined;
    seen.add(label);
  }
  if (seen.size !== expected.size) return undefined;

  return { ranking: ranking as string[], rationale: obj.rationale.trim() };
}
