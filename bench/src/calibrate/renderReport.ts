import {
  CALIBRATION_PROMPT_IDS,
  calibrationCalibrateCommand,
  calibrationRunCommand,
} from "./subset";
import type { CalibrationResult, GroupComparison } from "./compare";

function fmt(value: number | undefined, digits = 3): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function fmtPct(value: number | undefined): string {
  if (value === undefined) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function groupTitle(group: GroupComparison): string {
  return group.repeatIndex > 0 ? `${group.promptId} (repeat ${group.repeatIndex})` : group.promptId;
}

function inversionPairs(group: GroupComparison): string[] {
  const lines: string[] = [];
  const models = group.models;
  for (let i = 0; i < models.length; i++) {
    for (let j = i + 1; j < models.length; j++) {
      const a = models[i]!;
      const b = models[j]!;
      const peerABetter = a.peerAverageRank < b.peerAverageRank;
      const peerBBetter = b.peerAverageRank < a.peerAverageRank;
      const judgeABetter = a.judgeMedian > b.judgeMedian;
      const judgeBBetter = b.judgeMedian > a.judgeMedian;
      if (!peerABetter && !peerBBetter) continue;
      if (!judgeABetter && !judgeBBetter) continue;
      if (peerABetter === judgeABetter) continue;
      const peerWinner = peerABetter ? a.modelId : b.modelId;
      const judgeWinner = judgeABetter ? a.modelId : b.modelId;
      lines.push(
        `\`${peerWinner}\` ranked above \`${peerWinner === a.modelId ? b.modelId : a.modelId}\` by peers, ` +
          `but multi-judge median prefers \`${judgeWinner}\` ` +
          `(${a.modelId} ${a.judgeMedian.toFixed(2)} vs ${b.modelId} ${b.judgeMedian.toFixed(2)})`,
      );
    }
  }
  return lines;
}

export function renderCalibrationMarkdown(result: CalibrationResult): string {
  const batch = result.runBatchId ?? (result.allRuns ? "all stored batches" : "latest peer-rank batch");
  const humanNote =
    result.humanLabelCount === 0
      ? "No human labels supplied. Optional `--human <file.json>` comparison is omitted."
      : `${result.humanLabelCount} human-labeled group(s) loaded.`;

  const perGroupRows = result.groups
    .map(
      (g) =>
        `| \`${groupTitle(g)}\` | ${g.models.length} | ${fmt(g.spearmanPeerVsJudge)} | ${fmt(g.kendallPeerVsJudge)} | ` +
        `${g.inversionsPeerVsJudge}/${g.comparablePairsPeerVsJudge} | ${fmt(g.spearmanPeerVsHuman)} |`,
    )
    .join("\n");

  const disagreementBlocks = result.groups
    .map((g) => {
      const pairs = inversionPairs(g);
      const body =
        pairs.length === 0
          ? "No strict pairwise inversions vs multi-judge median."
          : pairs.map((line) => `- ${line}`).join("\n");
      return `### \`${groupTitle(g)}\`\n\n${body}\n`;
    })
    .join("\n");

  const modelTables = result.groups
    .map((g) => {
      const rows = [...g.models]
        .sort((a, b) => a.peerAverageRank - b.peerAverageRank)
        .map(
          (m) =>
            `| \`${m.modelId}\` | ${m.peerAverageRank.toFixed(2)} | ${m.judgeMedian.toFixed(2)} | ${
              m.humanRank === undefined ? "—" : m.humanRank.toFixed(2)
            } |`,
        )
        .join("\n");
      return `#### \`${groupTitle(g)}\`\n\n| Model | Peer avg rank (1=best) | Multi-judge median | Human rank |\n| --- | ---: | ---: | ---: |\n${rows}\n`;
    })
    .join("\n");

  return `# Peer-rank vs multi-judge calibration

**Issue:** [BSH-151](https://linear.app/bshp/issue/BSH-151)  
**Batch:** ${batch}  
**Generated:** ${result.generatedAt}

## Recommendation

**${result.recommendation}**

Rationale (does not depend on this batch's correlation being low):

- Rubric medians are *absolute* and trendable across batches if the judge roster is held fixed. Peer ranks are *relative* to whoever was in this roster — they cannot be the regression headline.
- High Spearman/Kendall agreement only means the two signals usually order models the same way. It does not make ranks a substitute for a 1–5 rubric, and it does not justify blending Borda points into \`avgScore\`.
- Low agreement is useful: ranks may discriminate when scores clump. That is a reason to *show* ranks as a secondary view, not to promote them.
- Human labels, when present, are the calibration gold standard. They still do not change how headlines are computed.

## Fixed calibration subset

| Prompt | Axis |
| --- | --- |
| \`${CALIBRATION_PROMPT_IDS[0]}\` | Instruction following / format |
| \`${CALIBRATION_PROMPT_IDS[1]}\` | Technical correctness |
| \`${CALIBRATION_PROMPT_IDS[2]}\` | Risk / judgment |
| \`${CALIBRATION_PROMPT_IDS[3]}\` | Review taste |

Prefer **3–4 diverse providers** as candidates and **at least two peer judges** (not the candidates themselves when possible). Peer ranking adds ≈ +N large-context calls per prompt.

## Reproducible command sequence

\`\`\`
${calibrationRunCommand()}
${calibrationCalibrateCommand()}
\`\`\`

Print the subset only: \`bun run bench calibrate --subset\`.

Optional human labels (best-first ranking *or* higher-is-better scores per group):

\`\`\`json
{
  "groups": [
    {
      "promptId": "debugging/javascript-debounce",
      "repeatIndex": 0,
      "ranking": ["model-a", "model-b", "model-c"]
    }
  ]
}
\`\`\`

\`\`\`
bun run bench calibrate --batch <run_batch_id> --human path/to/labels.json --out docs/peer-rank-calibration.md
\`\`\`

## Summary

${humanNote}

| Metric | Value |
| --- | --- |
| Groups compared | ${result.groups.length} |
| Groups skipped (<2 models with both signals) | ${result.skippedGroups} |
| Mean Spearman ρ (peer rank vs judge rank) | ${fmt(result.meanSpearmanPeerVsJudge)} |
| Mean Kendall τ-b (peer rank vs judge) | ${fmt(result.meanKendallPeerVsJudge)} |
| Pairwise inversion rate (peer vs judge) | ${fmtPct(result.inversionRatePeerVsJudge)} |
| Mean Spearman ρ (peer vs human) | ${fmt(result.meanSpearmanPeerVsHuman)} |
| Pairwise inversion rate (peer vs human) | ${fmtPct(result.inversionRatePeerVsHuman)} |
| Mean Spearman ρ (judge vs human) | ${fmt(result.meanSpearmanJudgeVsHuman)} |
| Pairwise inversion rate (judge vs human) | ${fmtPct(result.inversionRateJudgeVsHuman)} |

Spearman/Kendall are computed per (prompt, repeat) on models that have both a peer-rank aggregate and a peer-only multi-judge median, then averaged. +1 = same order, 0 = unrelated, −1 = reversed. Inversions count strict pairwise disagreements only (ties ignored).

## Per-prompt correlation

| Group | n models | Spearman ρ | Kendall τ-b | Inversions | Spearman vs human |
| --- | ---: | ---: | ---: | --- | ---: |
${perGroupRows || "| — | — | — | — | — | — |"}

## Pairwise disagreements (peer vs multi-judge)

${result.groups.length === 0 ? "No comparable groups in this batch.\n" : disagreementBlocks}

## Per-model signals

${result.groups.length === 0 ? "No rows.\n" : modelTables}

## Methodology

1. Run the fixed subset with \`--judges\` (multi-judge) and \`--peer-rank\` (anonymized Stage 2).
2. For each (prompt, repeat) group, take each model's **peer-only median rubric score** (self-judging excluded, same rule as report headlines) and its **peer-rank average position** (Borda aggregate; 1 = best).
3. Convert judge scores to midranks (higher score = better) and compute Spearman ρ and Kendall τ-b against peer average ranks (lower = better).
4. Count pairwise inversions: peers prefer A over B, judges prefer B over A.
5. If \`--human\` is provided, repeat the same comparisons against human ranks.

Headline \`avgScore\` is never rewritten by this command.
`;
}
