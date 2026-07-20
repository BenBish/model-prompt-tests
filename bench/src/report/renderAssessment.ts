import { judgeScoresForRow, median, perRunMedianScore, type ModelSummary, type ReportData, type ReportRow } from "./queryData";

export interface AssessmentMeta {
  generatedAt: string;
  reportPath: string;
  summaryPath: string;
  runBatchId?: string;
}

interface PromptWinner {
  promptId: string;
  modelId: string;
  score: number;
}

interface FlaggedCell {
  promptId: string;
  modelId: string;
  repeatIndex: number;
  spread: number;
  judgeScores: { judgeModelId: string; score: number }[];
}

interface ErrorEntry {
  promptId: string;
  modelId: string;
  kind: "run" | "judge";
  judgeModelId?: string;
  message: string;
}

const DISAGREEMENT_THRESHOLD = 2;

function formatNumber(value: number | undefined, digits = 2): string {
  return value === undefined ? "—" : value.toFixed(digits);
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "—" : `${(value * 100).toFixed(0)}%`;
}

function cellWinners(data: ReportData): PromptWinner[] {
  const winners: PromptWinner[] = [];
  for (const promptId of data.promptIds) {
    const byModel = data.rows.get(promptId)!;
    let best: PromptWinner | undefined;
    let contenders = 0;
    for (const [modelId, rows] of byModel) {
      const okRows = rows.filter((row) => row.runStatus === "ok");
      const perRunScores = okRows.flatMap((row) => {
        const score = perRunMedianScore(row);
        return score === undefined ? [] : [score];
      });
      if (perRunScores.length === 0) continue;
      contenders++;
      // Median across repeats, matching queryData.ts's summarize() and renderHtml's cell summary —
      // a single outlier repeat shouldn't decide the declared winner.
      const cellScore = median(perRunScores)!;
      if (!best || cellScore > best.score) {
        best = { promptId, modelId, score: cellScore };
      }
    }
    if (best && contenders > 1) winners.push(best);
  }
  return winners;
}

function flaggedCells(data: ReportData): FlaggedCell[] {
  const flagged: FlaggedCell[] = [];
  for (const promptId of data.promptIds) {
    const byModel = data.rows.get(promptId)!;
    for (const [modelId, rows] of byModel) {
      for (const row of rows) {
        if (row.runStatus !== "ok") continue;
        const scores = judgeScoresForRow(row);
        if (scores.length < 2) continue;
        const spread = Math.max(...scores) - Math.min(...scores);
        if (spread < DISAGREEMENT_THRESHOLD) continue;
        flagged.push({
          promptId,
          modelId,
          repeatIndex: row.repeatIndex,
          spread,
          judgeScores: row.judgeResults.flatMap((judge) =>
            judge.score === undefined ? [] : [{ judgeModelId: judge.judgeModelId, score: judge.score }],
          ),
        });
      }
    }
  }
  return flagged.sort((a, b) => b.spread - a.spread);
}

function errorInventory(data: ReportData): ErrorEntry[] {
  const errors: ErrorEntry[] = [];
  for (const promptId of data.promptIds) {
    const byModel = data.rows.get(promptId)!;
    for (const [modelId, rows] of byModel) {
      for (const row of rows) {
        if (row.runStatus === "error") {
          errors.push({ promptId, modelId, kind: "run", message: row.error ?? "unknown error" });
        }
        for (const judge of row.judgeResults) {
          if (judge.judgeStatus === "error") {
            errors.push({
              promptId,
              modelId,
              kind: "judge",
              judgeModelId: judge.judgeModelId,
              message: judge.judgeError ?? "unknown judge error",
            });
          }
        }
      }
    }
  }
  return errors;
}

export interface AssessmentSummary {
  meta: AssessmentMeta;
  modelSummaries: ModelSummary[];
  promptWinners: PromptWinner[];
  flaggedCells: FlaggedCell[];
  errors: ErrorEntry[];
  /** Untyped here to avoid report/ depending on swe/ types; cli.ts passes SweSummary[] through. */
  sweSummaries?: unknown;
}

export function buildAssessmentSummary(
  data: ReportData,
  meta: AssessmentMeta,
  sweSummaries?: unknown,
): AssessmentSummary {
  return {
    meta,
    modelSummaries: data.summaries,
    promptWinners: cellWinners(data),
    flaggedCells: flaggedCells(data),
    errors: errorInventory(data),
    ...(sweSummaries ? { sweSummaries } : {}),
  };
}

function renderModelSummaryTable(summaries: ModelSummary[]): string {
  const header =
    "| Model | Avg score (peer) | Self score | Median score | Score stddev | Repeat variance | Judge agreement | Avg latency ms | Median latency ms | Avg output tokens | Avg judge spread | Quality/sec | Avg cost | Total cost | Quality/$ | Truncated |\n" +
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |";
  const rows = summaries.map(
    (summary) =>
      `| \`${summary.modelId}\` | ${formatNumber(summary.avgScore)} | ${formatNumber(summary.selfScoreAvg)} | ${formatNumber(summary.medianScore)} | ` +
      `${formatNumber(summary.scoreStdDev)} | ${formatNumber(summary.repeatVariance)} | ` +
      `${formatPercent(summary.judgeAgreementPct)} | ${formatNumber(summary.avgLatencyMs, 0)} | ` +
      `${formatNumber(summary.medianLatencyMs, 0)} | ${formatNumber(summary.avgOutputTokens, 0)} | ` +
      `${formatNumber(summary.avgJudgeSpread)} | ${formatNumber(summary.qualityPerSecond, 3)} | ` +
      `${formatUsd(summary.avgCostUsd)} | ${formatUsd(summary.totalCostUsd)} | ` +
      `${formatNumber(summary.qualityPerDollar, 1)} | ${summary.truncatedRuns} |`,
  );
  return [header, ...rows].join("\n");
}

function formatUsd(value: number | undefined): string {
  return value === undefined ? "—" : `$${value.toFixed(4)}`;
}

function renderDimensionTable(summaries: ModelSummary[]): string | undefined {
  const dimensionIds = new Set<string>();
  for (const summary of summaries) {
    for (const id of Object.keys(summary.dimensionAverages ?? {})) dimensionIds.add(id);
  }
  if (dimensionIds.size === 0) return undefined;

  const sortedIds = [...dimensionIds].sort();
  const header = `| Model | ${sortedIds.join(" | ")} |\n| --- | ${sortedIds.map(() => "---:").join(" | ")} |`;
  const rows = summaries.map(
    (summary) =>
      `| \`${summary.modelId}\` | ${sortedIds.map((id) => formatNumber(summary.dimensionAverages?.[id])).join(" | ")} |`,
  );
  return [header, ...rows].join("\n");
}

export function renderAssessmentMarkdown(
  data: ReportData,
  meta: AssessmentMeta,
  sweSectionMarkdown = "",
): string {
  const summary = buildAssessmentSummary(data, meta);
  const sections: string[] = [];

  sections.push(`# Bench Assessment`);
  const metaLines = [
    meta.runBatchId ? `Batch: \`${meta.runBatchId}\`` : undefined,
    `Report: \`${meta.reportPath}\``,
    `Summary JSON: \`${meta.summaryPath}\``,
    `Generated: \`${meta.generatedAt}\``,
  ].filter(Boolean);
  sections.push(metaLines.join("\n"));

  sections.push(`## Model Summary\n\n${renderModelSummaryTable(summary.modelSummaries)}`);

  const dimensionTable = renderDimensionTable(summary.modelSummaries);
  if (dimensionTable) {
    sections.push(`## Dimension Averages\n\n${dimensionTable}`);
  }

  if (summary.promptWinners.length > 0) {
    const winnerLines = summary.promptWinners.map(
      (winner) => `- \`${winner.promptId}\`: \`${winner.modelId}\` (${winner.score.toFixed(2)})`,
    );
    sections.push(`## Per-Prompt Winners\n\n${winnerLines.join("\n")}`);
  }

  if (summary.flaggedCells.length > 0) {
    const flaggedLines = summary.flaggedCells.map((cell) => {
      const scoresText = cell.judgeScores.map((s) => `${s.judgeModelId}=${s.score}`).join(", ");
      const repeatSuffix = cell.repeatIndex > 0 ? ` (repeat ${cell.repeatIndex + 1})` : "";
      return `- \`${cell.promptId}\` x \`${cell.modelId}\`${repeatSuffix}: spread ${cell.spread} (${scoresText})`;
    });
    sections.push(
      `## Flagged for Review\n\nJudge scores disagreed by ${DISAGREEMENT_THRESHOLD}+ points on these runs:\n\n${flaggedLines.join("\n")}`,
    );
  }

  if (summary.errors.length > 0) {
    const errorLines = summary.errors.map((error) =>
      error.kind === "run"
        ? `- \`${error.promptId}\` x \`${error.modelId}\`: run error — ${error.message}`
        : `- \`${error.promptId}\` x \`${error.modelId}\`: judge error (${error.judgeModelId}) — ${error.message}`,
    );
    sections.push(`## Errors\n\n${errorLines.join("\n")}`);
  } else {
    sections.push(`## Errors\n\nNone.`);
  }

  if (sweSectionMarkdown) {
    sections.push(sweSectionMarkdown);
  }

  return `${sections.join("\n\n")}\n`;
}

export function buildNarrativePrompt(summary: AssessmentSummary): { systemPrompt: string; userPrompt: string } {
  const systemPrompt =
    "You write a short analytical narrative for a benchmark report. You will be given a JSON summary " +
    "of model scores, latencies, and errors. Write 3 short paragraphs of analysis: overall quality/speed " +
    "tradeoffs, notable per-prompt or per-dimension patterns, and anything that looks unreliable (judge " +
    "disagreement, errors). Only use numbers present in the JSON — never invent or estimate a number that " +
    "is not given. No markdown headings, no bullet lists, plain prose paragraphs only.";
  const userPrompt = `Benchmark summary JSON:\n${JSON.stringify(summary, null, 2)}`;
  return { systemPrompt, userPrompt };
}
