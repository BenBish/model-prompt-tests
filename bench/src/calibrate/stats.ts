import { average } from "../report/queryData";

/** Midranks: tied values share the average of the occupied 1-based positions. */
export function midranks(values: number[], better: "lower" | "higher"): number[] {
  const n = values.length;
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => (better === "lower" ? a.value - b.value : b.value - a.value));

  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && order[j + 1]!.value === order[i]!.value) j++;
    const avgRank = (i + 1 + (j + 1)) / 2;
    for (let k = i; k <= j; k++) {
      ranks[order[k]!.index] = avgRank;
    }
    i = j + 1;
  }
  return ranks;
}

export function pearson(xs: number[], ys: number[]): number | undefined {
  if (xs.length !== ys.length || xs.length < 2) return undefined;
  const mx = average(xs);
  const my = average(ys);
  if (mx === undefined || my === undefined) return undefined;

  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]! - mx;
    const y = ys[i]! - my;
    num += x * y;
    dx += x * x;
    dy += y * y;
  }
  const den = Math.sqrt(dx * dy);
  if (den === 0) return undefined;
  return num / den;
}

/**
 * Spearman ρ: Pearson correlation of midranks.
 * Both series should already be oriented the same way, or pass `better` per series.
 */
export function spearman(
  xs: number[],
  ys: number[],
  options: { xBetter?: "lower" | "higher"; yBetter?: "lower" | "higher" } = {},
): number | undefined {
  if (xs.length !== ys.length || xs.length < 2) return undefined;
  const xRanks = midranks(xs, options.xBetter ?? "lower");
  const yRanks = midranks(ys, options.yBetter ?? "lower");
  return pearson(xRanks, yRanks);
}

/**
 * Kendall τ-b (accounts for ties). Undefined when a series is constant
 * (denominator 0) or n < 2.
 */
export function kendallTauB(xs: number[], ys: number[]): number | undefined {
  if (xs.length !== ys.length || xs.length < 2) return undefined;

  let concordant = 0;
  let discordant = 0;
  let tieX = 0;
  let tieY = 0;

  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const dx = xs[i]! - xs[j]!;
      const dy = ys[i]! - ys[j]!;
      const sx = Math.sign(dx);
      const sy = Math.sign(dy);
      if (sx === 0 && sy === 0) continue;
      if (sx === 0) {
        tieX++;
        continue;
      }
      if (sy === 0) {
        tieY++;
        continue;
      }
      if (sx === sy) concordant++;
      else discordant++;
    }
  }

  const n1 = concordant + discordant + tieX;
  const n2 = concordant + discordant + tieY;
  const den = Math.sqrt(n1 * n2);
  if (den === 0) return undefined;
  return (concordant - discordant) / den;
}

export interface PairwiseDisagreement {
  inversions: number;
  comparablePairs: number;
}

/**
 * Count pairs whose strict order disagrees.
 * `aBetter` / `bBetter` say which direction is "better" on each series.
 */
export function pairwiseInversions(
  xs: number[],
  ys: number[],
  options: { xBetter?: "lower" | "higher"; yBetter?: "lower" | "higher" } = {},
): PairwiseDisagreement {
  const xBetter = options.xBetter ?? "lower";
  const yBetter = options.yBetter ?? "higher";
  let inversions = 0;
  let comparablePairs = 0;

  const xWins = (i: number, j: number): number => {
    const d = xs[i]! - xs[j]!;
    if (d === 0) return 0;
    const firstBetter = xBetter === "lower" ? d < 0 : d > 0;
    return firstBetter ? 1 : -1;
  };
  const yWins = (i: number, j: number): number => {
    const d = ys[i]! - ys[j]!;
    if (d === 0) return 0;
    const firstBetter = yBetter === "lower" ? d < 0 : d > 0;
    return firstBetter ? 1 : -1;
  };

  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const x = xWins(i, j);
      const y = yWins(i, j);
      if (x === 0 || y === 0) continue;
      comparablePairs++;
      if (x !== y) inversions++;
    }
  }

  return { inversions, comparablePairs };
}

export function meanDefined(values: Array<number | undefined>): number | undefined {
  return average(values.filter((v): v is number => v !== undefined));
}
