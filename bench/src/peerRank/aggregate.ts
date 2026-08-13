/**
 * Aggregate best-first rankings into Borda scores and an overall order.
 *
 * For n candidates, a model ranked 1st (index 0) gets n points, 2nd gets n-1, etc.
 * Higher Borda score = better. Ties are broken by model id (stable, deterministic).
 */

export interface RankAggregate {
  modelId: string;
  /** Sum of Borda points across all successful rankings. */
  bordaScore: number;
  /** Mean 1-based position (1 = best). Lower is better. */
  averageRank: number;
  /** How many successful rankings included this model. */
  timesRanked: number;
}

/**
 * @param rankings - each entry is a best-first ordered list of model ids
 */
export function aggregateRankings(rankings: string[][]): RankAggregate[] {
  if (rankings.length === 0) return [];

  const borda = new Map<string, number>();
  const rankSum = new Map<string, number>();
  const times = new Map<string, number>();

  for (const ranking of rankings) {
    const n = ranking.length;
    for (let i = 0; i < n; i++) {
      const modelId = ranking[i]!;
      borda.set(modelId, (borda.get(modelId) ?? 0) + (n - i));
      rankSum.set(modelId, (rankSum.get(modelId) ?? 0) + (i + 1));
      times.set(modelId, (times.get(modelId) ?? 0) + 1);
    }
  }

  const modelIds = [...new Set(rankings.flat())];
  const aggregates: RankAggregate[] = modelIds.map((modelId) => {
    const t = times.get(modelId) ?? 0;
    return {
      modelId,
      bordaScore: borda.get(modelId) ?? 0,
      averageRank: t > 0 ? (rankSum.get(modelId) ?? 0) / t : Number.POSITIVE_INFINITY,
      timesRanked: t,
    };
  });

  aggregates.sort((a, b) => {
    if (b.bordaScore !== a.bordaScore) return b.bordaScore - a.bordaScore;
    if (a.averageRank !== b.averageRank) return a.averageRank - b.averageRank;
    return a.modelId.localeCompare(b.modelId);
  });

  return aggregates;
}
