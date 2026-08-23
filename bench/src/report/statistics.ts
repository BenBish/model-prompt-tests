export interface Interval { low: number; high: number; confidence: number }
export type StatisticalVerdict = "win" | "loss" | "inconclusive" | "invalid-infrastructure";

export interface StatisticalTrial {
  taskId: string;
  modelId: string;
  repeatIndex: number;
  outcome: 0 | 1;
  infrastructureFailure?: boolean;
  judgeScore?: number;
  environmentFingerprint?: string;
}

export interface StatisticalConfig {
  confidence: number;
  practicalEquivalence: number;
  minimumMatchedTasks: number;
  minimumCoverage: number;
  bootstrapSamples: number;
  maximumComparisons: number;
}

export interface RateEstimate {
  modelId: string; successes: number; trials: number; rate?: number; interval?: Interval;
  taskCoverage: number; judgeCoverage: number; missingTasks: number; infrastructureFailures: number;
  ceilingConcentration: number; floorConcentration: number;
}

export interface PairedComparison {
  baselineId: string; candidateId: string; matchedTasks: number; unionTasks: number; coverage: number;
  wins: number; losses: number; ties: number; delta: number; interval: Interval;
  verdict: StatisticalVerdict; environmentFingerprints: string[]; exploratory: boolean;
  taskEffects: { taskId: string; baseline: number; candidate: number; delta: number }[];
  warnings: string[];
}

export interface RankStability { topModelId?: string; topRankProbability?: number; stable: boolean; samples: number }
export interface PairedPreferenceObservation { taskId: string; preferred: "baseline" | "candidate" | "tie"; positionSwapped?: boolean }
export interface PairedPreferenceSummary {
  observations: number; candidateWins: number; baselineWins: number; ties: number;
  candidateWinRateExcludingTies?: number; tieRate?: number; positionSwapCoverage: number;
}
export interface StatisticalAnalysis {
  config: StatisticalConfig; rates: RateEstimate[]; comparisons: PairedComparison[];
  rankStability: RankStability; warnings: string[];
}

export const DEFAULT_STATISTICAL_CONFIG: StatisticalConfig = {
  confidence: 0.95, practicalEquivalence: 0.02, minimumMatchedTasks: 5,
  minimumCoverage: 0.8, bootstrapSamples: 2000, maximumComparisons: 10,
};

/** Aggregate explicit paired preferences without converting ordinal rubric scores into preferences. */
export function analyzePairedPreferences(observations: PairedPreferenceObservation[]): PairedPreferenceSummary {
  const candidateWins = observations.filter((row) => row.preferred === "candidate").length;
  const baselineWins = observations.filter((row) => row.preferred === "baseline").length;
  const ties = observations.filter((row) => row.preferred === "tie").length;
  const decisive = candidateWins + baselineWins;
  return {
    observations: observations.length,
    candidateWins,
    baselineWins,
    ties,
    candidateWinRateExcludingTies: decisive ? candidateWins / decisive : undefined,
    tieRate: observations.length ? ties / observations.length : undefined,
    positionSwapCoverage: observations.length ? observations.filter((row) => row.positionSwapped !== undefined).length / observations.length : 0,
  };
}

// Wilson score interval for a binary proportion. z=1.96 is the documented 95% default.
export function wilsonInterval(successes: number, trials: number, confidence = 0.95): Interval | undefined {
  if (trials <= 0) return undefined;
  const z = confidence === 0.95 ? 1.959963984540054 : 1.959963984540054;
  const p = successes / trials;
  const denominator = 1 + z * z / trials;
  const center = (p + z * z / (2 * trials)) / denominator;
  const half = z * Math.sqrt((p * (1 - p) + z * z / (4 * trials)) / trials) / denominator;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half), confidence };
}

function mean(values: number[]): number { return values.reduce((a, b) => a + b, 0) / values.length; }
function mulberry32(seed: number): () => number { return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function quantile(sorted: number[], q: number): number { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))]!; }

/** Resample tasks, then repeats within each task, preserving the experimental hierarchy. */
export function hierarchicalBootstrapDelta(
  pairs: { baseline: number[]; candidate: number[] }[], samples = 2000, confidence = 0.95,
): Interval {
  if (pairs.length === 0) return { low: 0, high: 0, confidence };
  const random = mulberry32(0x221);
  const deltas: number[] = [];
  for (let sample = 0; sample < samples; sample++) {
    const taskDeltas: number[] = [];
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[Math.floor(random() * pairs.length)]!;
      const baseline = Array.from({ length: pair.baseline.length }, () => pair.baseline[Math.floor(random() * pair.baseline.length)]!);
      const candidate = Array.from({ length: pair.candidate.length }, () => pair.candidate[Math.floor(random() * pair.candidate.length)]!);
      taskDeltas.push(mean(candidate) - mean(baseline));
    }
    deltas.push(mean(taskDeltas));
  }
  deltas.sort((a, b) => a - b);
  const alpha = (1 - confidence) / 2;
  return { low: quantile(deltas, alpha), high: quantile(deltas, 1 - alpha), confidence };
}

export function analyzePairedTrials(trials: StatisticalTrial[], options: Partial<StatisticalConfig> = {}): StatisticalAnalysis {
  const config = { ...DEFAULT_STATISTICAL_CONFIG, ...options };
  const modelIds = [...new Set(trials.map((trial) => trial.modelId))].sort();
  const allTasks = new Set(trials.map((trial) => trial.taskId));
  const usable = trials.filter((trial) => !trial.infrastructureFailure);
  const rates = modelIds.map((modelId): RateEstimate => {
    const scheduled = trials.filter((trial) => trial.modelId === modelId);
    const rows = usable.filter((trial) => trial.modelId === modelId);
    const tasks = new Set(rows.map((row) => row.taskId));
    const successes = rows.reduce((sum, row) => sum + row.outcome, 0);
    const taskRates = [...tasks].map((task) => mean(rows.filter((row) => row.taskId === task).map((row) => row.outcome)));
    const judged = rows.filter((row) => row.judgeScore !== undefined).length;
    return { modelId, successes, trials: rows.length, rate: rows.length ? successes / rows.length : undefined,
      interval: wilsonInterval(successes, rows.length, config.confidence), taskCoverage: allTasks.size ? tasks.size / allTasks.size : 0,
      judgeCoverage: rows.length ? judged / rows.length : 0, missingTasks: allTasks.size - tasks.size,
      infrastructureFailures: scheduled.filter((row) => row.infrastructureFailure).length,
      ceilingConcentration: taskRates.length ? taskRates.filter((rate) => rate === 1).length / taskRates.length : 0,
      floorConcentration: taskRates.length ? taskRates.filter((rate) => rate === 0).length / taskRates.length : 0 };
  });
  const comparisons: PairedComparison[] = [];
  for (let i = 0; i < modelIds.length; i++) for (let j = i + 1; j < modelIds.length; j++) {
    const baselineId = modelIds[i]!, candidateId = modelIds[j]!;
    const baselineRows = usable.filter((row) => row.modelId === baselineId), candidateRows = usable.filter((row) => row.modelId === candidateId);
    const baselineTasks = new Set(baselineRows.map((row) => row.taskId)), candidateTasks = new Set(candidateRows.map((row) => row.taskId));
    const union = new Set([...baselineTasks, ...candidateTasks]);
    const matched = [...baselineTasks].filter((task) => candidateTasks.has(task)).sort();
    const taskEffects = matched.map((taskId) => { const baseline = mean(baselineRows.filter((r) => r.taskId === taskId).map((r) => r.outcome)); const candidate = mean(candidateRows.filter((r) => r.taskId === taskId).map((r) => r.outcome)); return { taskId, baseline, candidate, delta: candidate - baseline }; });
    const pairs = matched.map((task) => ({ baseline: baselineRows.filter((r) => r.taskId === task).map((r) => r.outcome), candidate: candidateRows.filter((r) => r.taskId === task).map((r) => r.outcome) }));
    const delta = taskEffects.length ? mean(taskEffects.map((effect) => effect.delta)) : 0;
    const interval = hierarchicalBootstrapDelta(pairs, config.bootstrapSamples, config.confidence);
    const coverage = union.size ? matched.length / union.size : 0;
    const environments = [...new Set([...baselineRows, ...candidateRows].flatMap((row) => row.environmentFingerprint ? [row.environmentFingerprint] : []))].sort();
    const warnings: string[] = [];
    if (matched.length < config.minimumMatchedTasks) warnings.push(`low sample size: ${matched.length} matched tasks; minimum is ${config.minimumMatchedTasks}`);
    if (coverage < config.minimumCoverage) warnings.push(`low paired coverage: ${(coverage * 100).toFixed(0)}%; minimum is ${(config.minimumCoverage * 100).toFixed(0)}%`);
    if (environments.length > 1) warnings.push("cross-domain correctness result is exploratory; performance deltas are not portable");
    let verdict: StatisticalVerdict = "inconclusive";
    const infrastructureOnly = matched.length === 0 && trials.some((row) => row.infrastructureFailure);
    if (infrastructureOnly) verdict = "invalid-infrastructure";
    else if (warnings.filter((w) => w.startsWith("low ")).length === 0) {
      if (interval.low > config.practicalEquivalence) verdict = "win";
      else if (interval.high < -config.practicalEquivalence) verdict = "loss";
    }
    comparisons.push({ baselineId, candidateId, matchedTasks: matched.length, unionTasks: union.size, coverage,
      wins: taskEffects.filter((x) => x.delta > 0).length, losses: taskEffects.filter((x) => x.delta < 0).length,
      ties: taskEffects.filter((x) => x.delta === 0).length, delta, interval, verdict,
      environmentFingerprints: environments, exploratory: environments.length > 1, taskEffects, warnings });
  }
  const taskIds = [...allTasks];
  const random = mulberry32(0x5221); const topCounts = new Map<string, number>();
  for (let sample = 0; sample < config.bootstrapSamples && taskIds.length; sample++) {
    const sampled = Array.from({ length: taskIds.length }, () => taskIds[Math.floor(random() * taskIds.length)]!);
    const scores = modelIds.map((modelId) => ({ modelId, score: mean(sampled.map((task) => { const rows = usable.filter((r) => r.modelId === modelId && r.taskId === task); return rows.length ? mean(rows.map((r) => r.outcome)) : 0; })) }));
    scores.sort((a, b) => b.score - a.score || a.modelId.localeCompare(b.modelId));
    if (scores[0]) topCounts.set(scores[0].modelId, (topCounts.get(scores[0].modelId) ?? 0) + 1);
  }
  const top = [...topCounts].sort((a, b) => b[1] - a[1])[0];
  const topRankProbability = top ? top[1] / config.bootstrapSamples : undefined;
  const warnings = comparisons.flatMap((comparison) => comparison.warnings);
  if (comparisons.length > config.maximumComparisons) warnings.push(`excessive multiple comparisons: ${comparisons.length}; predeclare a primary comparison`);
  if (topRankProbability !== undefined && topRankProbability < 0.8) warnings.push(`unstable ranks: top-rank probability ${(topRankProbability * 100).toFixed(0)}%`);
  if (rates.some((rate) => rate.ceilingConcentration >= 0.8)) warnings.push("ceiling concentration limits discrimination");
  if (rates.some((rate) => rate.floorConcentration >= 0.8)) warnings.push("floor concentration limits discrimination");
  return { config, rates, comparisons, rankStability: { topModelId: top?.[0], topRankProbability, stable: (topRankProbability ?? 0) >= 0.8, samples: config.bootstrapSamples }, warnings: [...new Set(warnings)] };
}
