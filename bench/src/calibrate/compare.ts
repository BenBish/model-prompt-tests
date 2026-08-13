import type { Database } from "bun:sqlite";
import { queryPeerRankReportData, type PeerRankGroupView } from "../peerRank/reportData";
import { perRunMedianScore, queryReportData, type ReportData } from "../report/queryData";
import {
  type HumanGroupLabel,
  humanLabelKey,
  humanRanksForGroup,
} from "./humanLabels";
import { kendallTauB, meanDefined, pairwiseInversions, spearman } from "./stats";

export const SIDE_SIGNAL_RECOMMENDATION =
  "Keep peer ranks as a side signal only. Do not let Borda scores, average ranks, or inversion counts influence avgScore headlines, badges, default sort, or regression leaderboards.";

export interface ModelPairSignals {
  modelId: string;
  peerAverageRank: number;
  judgeMedian: number;
  humanRank?: number;
}

export interface GroupComparison {
  promptId: string;
  repeatIndex: number;
  models: ModelPairSignals[];
  spearmanPeerVsJudge?: number;
  kendallPeerVsJudge?: number;
  inversionsPeerVsJudge: number;
  comparablePairsPeerVsJudge: number;
  spearmanPeerVsHuman?: number;
  kendallPeerVsHuman?: number;
  inversionsPeerVsHuman: number;
  comparablePairsPeerVsHuman: number;
  spearmanJudgeVsHuman?: number;
  inversionsJudgeVsHuman: number;
  comparablePairsJudgeVsHuman: number;
}

export interface CalibrationResult {
  runBatchId?: string;
  allRuns: boolean;
  generatedAt: string;
  groups: GroupComparison[];
  skippedGroups: number;
  meanSpearmanPeerVsJudge?: number;
  meanKendallPeerVsJudge?: number;
  inversionRatePeerVsJudge?: number;
  meanSpearmanPeerVsHuman?: number;
  inversionRatePeerVsHuman?: number;
  meanSpearmanJudgeVsHuman?: number;
  inversionRateJudgeVsHuman?: number;
  humanLabelCount: number;
  humanGroupsMatched: number;
  unmatchedHumanGroups: string[];
  recommendation: typeof SIDE_SIGNAL_RECOMMENDATION;
}

function judgeMedianFor(
  data: ReportData,
  promptId: string,
  modelId: string,
  repeatIndex: number,
): number | undefined {
  const row = data.rows
    .get(promptId)
    ?.get(modelId)
    ?.find((r) => r.repeatIndex === repeatIndex && r.runStatus === "ok");
  if (!row) return undefined;
  return perRunMedianScore(row);
}

function compareGroup(
  group: PeerRankGroupView,
  report: ReportData,
  human?: HumanGroupLabel,
): GroupComparison | undefined {
  const models: ModelPairSignals[] = [];
  const humanRanks = human ? humanRanksForGroup(human) : new Map<string, number>();

  for (const agg of group.aggregate) {
    const judgeMedian = judgeMedianFor(report, group.promptId, agg.modelId, group.repeatIndex);
    if (judgeMedian === undefined) continue;
    const humanRank = humanRanks.get(agg.modelId);
    models.push({
      modelId: agg.modelId,
      peerAverageRank: agg.averageRank,
      judgeMedian,
      humanRank,
    });
  }

  if (models.length < 2) return undefined;

  const peer = models.map((m) => m.peerAverageRank);
  const judge = models.map((m) => m.judgeMedian);
  const vsJudge = pairwiseInversions(peer, judge, { xBetter: "lower", yBetter: "higher" });

  const withHuman = models.filter((m) => m.humanRank !== undefined);
  const peerH = withHuman.map((m) => m.peerAverageRank);
  const judgeH = withHuman.map((m) => m.judgeMedian);
  const humanH = withHuman.map((m) => m.humanRank!);
  const vsHuman =
    withHuman.length >= 2
      ? pairwiseInversions(peerH, humanH, { xBetter: "lower", yBetter: "lower" })
      : { inversions: 0, comparablePairs: 0 };
  const judgeVsHuman =
    withHuman.length >= 2
      ? pairwiseInversions(judgeH, humanH, { xBetter: "higher", yBetter: "lower" })
      : { inversions: 0, comparablePairs: 0 };

  return {
    promptId: group.promptId,
    repeatIndex: group.repeatIndex,
    models,
    spearmanPeerVsJudge: spearman(peer, judge, { xBetter: "lower", yBetter: "higher" }),
    kendallPeerVsJudge: kendallTauB(
      models.map((m) => m.peerAverageRank),
      models.map((m) => -m.judgeMedian),
    ),
    inversionsPeerVsJudge: vsJudge.inversions,
    comparablePairsPeerVsJudge: vsJudge.comparablePairs,
    spearmanPeerVsHuman:
      withHuman.length >= 2 ? spearman(peerH, humanH, { xBetter: "lower", yBetter: "lower" }) : undefined,
    kendallPeerVsHuman: withHuman.length >= 2 ? kendallTauB(peerH, humanH) : undefined,
    inversionsPeerVsHuman: vsHuman.inversions,
    comparablePairsPeerVsHuman: vsHuman.comparablePairs,
    spearmanJudgeVsHuman:
      withHuman.length >= 2 ? spearman(judgeH, humanH, { xBetter: "higher", yBetter: "lower" }) : undefined,
    inversionsJudgeVsHuman: judgeVsHuman.inversions,
    comparablePairsJudgeVsHuman: judgeVsHuman.comparablePairs,
  };
}

function rate(inversions: number, pairs: number): number | undefined {
  if (pairs === 0) return undefined;
  return inversions / pairs;
}

export function comparePeerRanksToJudges(
  report: ReportData,
  peerGroups: PeerRankGroupView[],
  humanByKey: Map<string, HumanGroupLabel> = new Map(),
  meta: { runBatchId?: string; allRuns?: boolean; generatedAt?: string } = {},
): CalibrationResult {
  const groups: GroupComparison[] = [];
  let skippedGroups = 0;
  const matchedHumanKeys = new Set<string>();

  for (const group of peerGroups) {
    const key = humanLabelKey(group.promptId, group.repeatIndex);
    const human = humanByKey.get(key);
    const compared = compareGroup(group, report, human);
    if (!compared) {
      skippedGroups++;
      continue;
    }
    if (human) matchedHumanKeys.add(key);
    groups.push(compared);
  }

  const unmatchedHumanGroups = [...humanByKey.entries()]
    .filter(([key]) => !matchedHumanKeys.has(key))
    .map(([, label]) =>
      label.repeatIndex > 0 ? `${label.promptId} (repeat ${label.repeatIndex})` : label.promptId,
    );

  const sum = (pick: (g: GroupComparison) => number) => groups.reduce((acc, g) => acc + pick(g), 0);

  return {
    runBatchId: meta.runBatchId,
    allRuns: meta.allRuns === true,
    generatedAt: meta.generatedAt ?? new Date().toISOString(),
    groups,
    skippedGroups,
    meanSpearmanPeerVsJudge: meanDefined(groups.map((g) => g.spearmanPeerVsJudge)),
    meanKendallPeerVsJudge: meanDefined(groups.map((g) => g.kendallPeerVsJudge)),
    inversionRatePeerVsJudge: rate(
      sum((g) => g.inversionsPeerVsJudge),
      sum((g) => g.comparablePairsPeerVsJudge),
    ),
    meanSpearmanPeerVsHuman: meanDefined(groups.map((g) => g.spearmanPeerVsHuman)),
    inversionRatePeerVsHuman: rate(
      sum((g) => g.inversionsPeerVsHuman),
      sum((g) => g.comparablePairsPeerVsHuman),
    ),
    meanSpearmanJudgeVsHuman: meanDefined(groups.map((g) => g.spearmanJudgeVsHuman)),
    inversionRateJudgeVsHuman: rate(
      sum((g) => g.inversionsJudgeVsHuman),
      sum((g) => g.comparablePairsJudgeVsHuman),
    ),
    humanLabelCount: humanByKey.size,
    humanGroupsMatched: matchedHumanKeys.size,
    unmatchedHumanGroups,
    recommendation: SIDE_SIGNAL_RECOMMENDATION,
  };
}

export function resolveCalibrationBatchId(
  db: Database,
  options: { runBatchId?: string; allRuns?: boolean } = {},
): string | undefined {
  if (options.runBatchId) return options.runBatchId;
  if (options.allRuns) return undefined;
  const latest = db
    .query(`SELECT run_batch_id FROM peer_ranks ORDER BY ranked_at DESC LIMIT 1`)
    .get() as { run_batch_id: string } | undefined;
  return latest?.run_batch_id;
}

export function calibrateFromDb(
  db: Database,
  options: { runBatchId?: string; allRuns?: boolean; humanByKey?: Map<string, HumanGroupLabel> } = {},
): CalibrationResult {
  const runBatchId = resolveCalibrationBatchId(db, options);
  const report = queryReportData(db, {
    runBatchId,
    allRuns: options.allRuns,
  });
  const peer = queryPeerRankReportData(db, {
    runBatchId,
    allRuns: options.allRuns,
  });
  return comparePeerRanksToJudges(report, peer.groups, options.humanByKey ?? new Map(), {
    runBatchId,
    allRuns: options.allRuns,
  });
}
