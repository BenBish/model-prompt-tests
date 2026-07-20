import { escapeHtml } from "../util/html";
import {
  median,
  perRunMedianScore,
  type JudgeReportRow,
  type ModelSummary,
  type ReportData,
  type ReportRow,
} from "./queryData";
import {
  assignSeriesSlots,
  chartFigure,
  chartRuntimeScript,
  formatCompactNumber,
  formatUsd,
  paletteStyleBlock,
  renderBarChart,
  renderFrontierScatter,
  renderModelLegend,
  renderScoreDistribution,
  renderScoreHeatmap,
  reportBaseStyles,
  type BarRow,
  type HeatmapCell,
  type ModelScoreDistribution,
  type ScatterPoint,
} from "./charts";

export function scoreBadgeColor(score: number | undefined): string {
  if (score === undefined) return "#888";
  if (score >= 5) return "#1a7f37";
  if (score >= 4) return "#4c9a2a";
  if (score >= 3) return "#b08800";
  if (score >= 2) return "#c2680a";
  return "#c62828";
}

function renderRunDetails(row: ReportRow, runScore: number | undefined): string {
  if (row.runStatus === "error") {
    return `<details><summary style="color:#c62828">error${row.repeatIndex > 0 ? ` (repeat ${row.repeatIndex + 1})` : ""}</summary><pre>${escapeHtml(row.error)}</pre></details>`;
  }

  // Peer-only badge — matches heatmap, summary, and export headline scores.
  const badgeColor = scoreBadgeColor(runScore);
  const summaryLabel = runScore !== undefined ? runScore.toFixed(2) : "?";
  const meta = [
    row.startedAt,
    `batch ${row.runBatchId}`,
    row.repeatIndex > 0 ? `repeat ${row.repeatIndex + 1}` : undefined,
    row.latencyMs !== undefined ? `${row.latencyMs}ms` : undefined,
    row.inputTokens !== undefined || row.outputTokens !== undefined
      ? `${row.inputTokens ?? "?"} in / ${row.outputTokens ?? "?"} out tokens`
      : undefined,
    row.costUsd !== undefined ? formatUsd(row.costUsd) : undefined,
    row.stopReason ? `stop: ${row.stopReason}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return `
    <details data-model="${escapeHtml(row.modelId)}">
      <summary><span class="badge" style="background:${badgeColor}">${summaryLabel}</span> ${escapeHtml(meta)}</summary>
      <div class="run-detail">
        <h4>Output</h4>
        <pre>${escapeHtml(row.outputText)}</pre>
        ${row.judgeResults.map((judge) => renderJudgeResult(judge, row.modelId)).join("")}
      </div>
    </details>
  `;
}

function renderJudgeResult(judge: JudgeReportRow, modelId: string): string {
  const selfJudgeSuffix = judge.judgeModelId === modelId ? " self-judge" : "";
  if (judge.judgeStatus === "error") {
    return `<h4 style="color:#c62828">Judge error (${escapeHtml(judge.judgeModelId)}${selfJudgeSuffix})</h4><pre>${escapeHtml(judge.judgeError)}</pre>`;
  }
  const dimensionsHtml =
    judge.dimensions && Object.keys(judge.dimensions).length > 0
      ? `
    <ul class="dimensions">
      ${Object.entries(judge.dimensions)
        .map(
          ([id, dim]) =>
            `<li><span class="badge" style="background:${scoreBadgeColor(dim.score)}">${dim.score}</span> <b>${escapeHtml(id)}</b>: ${escapeHtml(dim.rationale)}</li>`,
        )
        .join("")}
    </ul>
    ${judge.weightedScore !== undefined ? `<p class="weighted-score">weighted score: ${judge.weightedScore.toFixed(2)}</p>` : ""}
  `
      : "";
  return `
    <h4>Judge ${escapeHtml(judge.judgeModelId)}${selfJudgeSuffix}: ${judge.score ?? "?"}</h4>
    <pre>${escapeHtml(judge.rationale)}</pre>
    ${dimensionsHtml}
  `;
}

function renderCellSummary(rows: ReportRow[], scores: number[]): string {
  if (rows.length <= 1 || scores.length === 0) return "";
  const sorted = [...scores].sort((a, b) => a - b);
  const med = median(scores)!;
  return `<div class="cell-summary">median ${med.toFixed(2)} (${sorted[0]!.toFixed(2)}–${sorted[sorted.length - 1]!.toFixed(2)}, n=${scores.length})</div>`;
}

function renderCell(modelId: string, rows: ReportRow[] | undefined): string {
  if (!rows || rows.length === 0) return `<td class="empty" data-model="${escapeHtml(modelId)}">—</td>`;

  const scoresByRunId = new Map<number, number | undefined>();
  const okScores: number[] = [];
  for (const row of rows) {
    if (row.runStatus !== "ok") continue;
    const score = perRunMedianScore(row);
    scoresByRunId.set(row.runId, score);
    if (score !== undefined) okScores.push(score);
  }

  const details = rows.map((row) => renderRunDetails(row, scoresByRunId.get(row.runId))).join("<hr/>");
  return `<td data-model="${escapeHtml(modelId)}">${renderCellSummary(rows, okScores)}${details}</td>`;
}

export function formatNumber(value: number | undefined, digits = 2): string {
  return value === undefined ? "—" : value.toFixed(digits);
}

export function formatPercent(value: number | undefined): string {
  return value === undefined ? "—" : `${(value * 100).toFixed(0)}%`;
}

export { formatUsd };

function sortableCell(value: number | undefined, digits: number, colKey: string): string {
  const display = formatNumber(value, digits);
  return `<td data-col="${colKey}" data-value="${value ?? ""}">${display}</td>`;
}

function renderDimensionAverages(summaries: ModelSummary[]): string {
  const dimensionIds = new Set<string>();
  for (const summary of summaries) {
    for (const id of Object.keys(summary.dimensionAverages ?? {})) dimensionIds.add(id);
  }
  if (dimensionIds.size === 0) return "";

  const sortedIds = [...dimensionIds].sort();
  const headerCells = sortedIds.map((id) => `<th>${escapeHtml(id)}</th>`).join("");
  const bodyRows = summaries
    .map((summary) => {
      const cells = sortedIds
        .map((id) => `<td>${formatNumber(summary.dimensionAverages?.[id])}</td>`)
        .join("");
      return `<tr data-model="${escapeHtml(summary.modelId)}"><th>${escapeHtml(summary.modelId)}</th>${cells}</tr>`;
    })
    .join("");

  return `
    <h2>Dimension Averages</h2>
    <table class="summary-table">
      <thead><tr><th>Model</th>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;
}

function renderSummaryRows(summaries: ModelSummary[]): string {
  return summaries
    .map(
      (summary) => `
        <tr data-model="${escapeHtml(summary.modelId)}">
          <th data-col="model" data-value="${escapeHtml(summary.modelId)}">${escapeHtml(summary.modelId)}</th>
          <td data-col="ok" data-value="${summary.okRuns}">${summary.okRuns}</td>
          <td data-col="errors" data-value="${summary.errorRuns}">${summary.errorRuns}</td>
          <td data-col="missing" data-value="${summary.missingJudgeScores}">${summary.missingJudgeScores}</td>
          ${sortableCell(summary.avgScore, 2, "score")}
          ${sortableCell(summary.selfScoreAvg, 2, "self-score")}
          ${sortableCell(summary.medianScore, 2, "median")}
          ${sortableCell(summary.scoreStdDev, 2, "score-stddev")}
          ${sortableCell(summary.repeatVariance, 2, "repeat-var")}
          <td data-col="agreement" data-value="${summary.judgeAgreementPct ?? ""}">${formatPercent(summary.judgeAgreementPct)}</td>
          ${sortableCell(summary.avgLatencyMs, 0, "latency")}
          ${sortableCell(summary.medianLatencyMs, 0, "median-latency")}
          ${sortableCell(summary.avgOutputTokens, 0, "output-tokens")}
          ${sortableCell(summary.avgJudgeSpread, 2, "judge-spread")}
          ${sortableCell(summary.qualityPerSecond, 3, "quality-per-sec")}
          <td data-col="avg-cost" data-value="${summary.avgCostUsd ?? ""}">${summary.avgCostUsd !== undefined ? formatUsd(summary.avgCostUsd) : "—"}</td>
          <td data-col="cost" data-value="${summary.totalCostUsd ?? ""}">${summary.totalCostUsd !== undefined ? formatUsd(summary.totalCostUsd) : "—"}</td>
          ${sortableCell(summary.qualityPerDollar, 1, "quality-per-dollar")}
          <td data-col="truncated" data-value="${summary.truncatedRuns}">${summary.truncatedRuns}</td>
        </tr>
      `,
    )
    .join("");
}

function renderStatTiles(summaries: ModelSummary[]): string {
  const scored = summaries.filter((s) => s.avgScore !== undefined);
  const winner =
    scored.length > 0 ? scored.reduce((a, b) => ((b.avgScore ?? 0) > (a.avgScore ?? 0) ? b : a)) : undefined;
  const totalCost = summaries.reduce((sum, s) => sum + (s.totalCostUsd ?? 0), 0);
  const hasCost = summaries.some((s) => s.totalCostUsd !== undefined);
  const totalTruncated = summaries.reduce((sum, s) => sum + s.truncatedRuns, 0);
  const totalOkRuns = summaries.reduce((sum, s) => sum + s.okRuns, 0);

  const tiles = [
    { label: "Models tested", value: String(summaries.length) },
    winner
      ? { label: "Top peer score", value: `${winner.avgScore!.toFixed(2)}`, sub: winner.modelId }
      : { label: "Top peer score", value: "—" },
    { label: "Total runs", value: formatCompactNumber(totalOkRuns) },
    hasCost ? { label: "Total cost", value: formatUsd(totalCost) } : { label: "Total cost", value: "n/a" },
    { label: "Truncated runs", value: String(totalTruncated) },
  ];

  return `
    <div class="stat-tiles">
      ${tiles
        .map(
          (tile) => `
        <div class="stat-tile">
          <div class="stat-label">${escapeHtml(tile.label)}</div>
          <div class="stat-value">${escapeHtml(tile.value)}</div>
          ${"sub" in tile && tile.sub ? `<div class="stat-sub">${escapeHtml(tile.sub)}</div>` : ""}
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function buildCostScatter(summaries: ModelSummary[]): ScatterPoint[] {
  return summaries
    .filter((s) => s.avgScore !== undefined && s.avgCostUsd !== undefined)
    .map((s) => ({
      modelId: s.modelId,
      x: s.avgCostUsd!,
      y: s.avgScore!,
      tooltipLines: [`score ${s.avgScore!.toFixed(2)}`, `${formatUsd(s.avgCostUsd!)} / run`, `${s.okRuns} ok runs`],
    }));
}

function buildLatencyScatter(summaries: ModelSummary[]): ScatterPoint[] {
  return summaries
    .filter((s) => s.avgScore !== undefined && s.avgLatencyMs !== undefined)
    .map((s) => ({
      modelId: s.modelId,
      x: s.avgLatencyMs! / 1000,
      y: s.avgScore!,
      tooltipLines: [
        `score ${s.avgScore!.toFixed(2)}`,
        `${(s.avgLatencyMs! / 1000).toFixed(1)}s / run`,
        `${s.okRuns} ok runs`,
      ],
    }));
}

function buildCostBars(summaries: ModelSummary[]): BarRow[] {
  return summaries
    .filter((s) => s.totalCostUsd !== undefined)
    .map((s) => ({ modelId: s.modelId, value: s.totalCostUsd!, formattedValue: formatUsd(s.totalCostUsd!) }));
}

function buildDistribution(data: ReportData): ModelScoreDistribution[] {
  const byModel = new Map<string, number[]>();
  for (const byModelRows of data.rows.values()) {
    for (const [modelId, rows] of byModelRows) {
      for (const row of rows) {
        if (row.runStatus !== "ok") continue;
        const peer = perRunMedianScore(row);
        if (peer === undefined) continue;
        const list = byModel.get(modelId) ?? [];
        list.push(peer);
        byModel.set(modelId, list);
      }
    }
  }
  return data.modelIds.map((modelId) => ({ modelId, scores: byModel.get(modelId) ?? [] }));
}

function buildHeatmapCells(data: ReportData): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  for (const promptId of data.promptIds) {
    for (const modelId of data.modelIds) {
      const rows = data.rows.get(promptId)?.get(modelId) ?? [];
      const okRows = rows.filter((r) => r.runStatus === "ok");
      const scores = okRows.flatMap((row) => {
        const score = perRunMedianScore(row);
        return score === undefined ? [] : [score];
      });
      cells.push({
        promptId,
        modelId,
        avgScore:
          scores.length > 0 ? scores.reduce((sum, value) => sum + value, 0) / scores.length : undefined,
        okRuns: okRows.length,
        errorRuns: rows.length - okRows.length,
      });
    }
  }
  return cells;
}

function renderChartsSection(data: ReportData, slots: Map<string, number>): string {
  const costScatter = buildCostScatter(data.summaries);
  const latencyScatter = buildLatencyScatter(data.summaries);
  const distribution = buildDistribution(data);
  const costBars = buildCostBars(data.summaries);
  const heatmapCells = buildHeatmapCells(data);

  return `
    <div class="chart-grid">
      <div class="chart-card chart-card-wide">
        ${chartFigure(
          "Quality vs. cost",
          "Peer score against average cost per run. The dashed line traces the Pareto frontier.",
          renderFrontierScatter(costScatter, {
            xLabel: "Cost per run (USD)",
            xFormat: (v) => formatUsd(v),
            slots,
            width: 1080,
            height: 300,
            emptyMessage:
              "No cost data — add pricing to models.json or use an OpenRouter model to see this chart.",
          }),
        )}
      </div>
      <div class="chart-card">
        ${chartFigure(
          "Quality vs. latency",
          "Peer score against average wall-clock latency per run.",
          renderFrontierScatter(latencyScatter, {
            xLabel: "Latency (s)",
            xFormat: (v) => `${v.toFixed(1)}s`,
            slots,
          }),
        )}
      </div>
      <div class="chart-card">
        ${chartFigure(
          "Score distribution",
          "Peer scores across runs per model — wide ranges mean high variance.",
          renderScoreDistribution(distribution, slots),
        )}
      </div>
      <div class="chart-card">
        ${chartFigure(
          "Total cost by model",
          "Summed estimated or provider-reported cost across all runs in this batch.",
          renderBarChart(costBars, slots),
        )}
      </div>
      <div class="chart-card chart-card-wide">
        ${chartFigure(
          "Score heatmap",
          "Every prompt × model cell, colored by average peer score.",
          renderScoreHeatmap(data.promptIds, data.modelIds, heatmapCells),
        )}
      </div>
    </div>
  `;
}

export function renderReportHtml(data: ReportData, generatedAt: string, sweSectionHtml = ""): string {
  const seriesSlots = assignSeriesSlots(data.modelIds);
  const headerCells = data.modelIds.map((modelId) => `<th>${escapeHtml(modelId)}</th>`).join("");

  const bodyRows = data.promptIds
    .map((promptId) => {
      const byModel = data.rows.get(promptId)!;
      const cells = data.modelIds.map((modelId) => renderCell(modelId, byModel.get(modelId))).join("");
      return `<tr><th class="prompt-id">${escapeHtml(promptId)}</th>${cells}</tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>model-prompt-tests bench report</title>
<style>
${reportBaseStyles()}
${paletteStyleBlock()}
.badge { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 0.75rem; color: #fff; font-weight: bold; }
pre { white-space: pre-wrap; word-break: break-word; background: #f5f5f5; padding: 0.5rem; border-radius: 0.25rem; max-height: 24rem; overflow-y: auto; }
summary { cursor: pointer; }
.run-detail h4 { margin-bottom: 0.25rem; }
hr { border: none; border-top: 1px dashed #ccc; margin: 0.5rem 0; }
.summary-table { margin-bottom: 2rem; }
.cell-summary { font-size: 0.8rem; color: #666; margin-bottom: 0.35rem; }
ul.dimensions { margin: 0.25rem 0; padding-left: 1.25rem; }
ul.dimensions li { margin-bottom: 0.15rem; }
p.weighted-score { font-size: 0.85rem; color: #666; margin: 0.15rem 0 0.5rem; }
th.prompt-id { white-space: nowrap; font-family: monospace; }
td.empty { text-align: center; color: #999; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ccc; padding: 0.5rem; vertical-align: top; text-align: left; }
</style>
</head>
<body>
  <div class="page viz-root">
    <header class="report-header">
      <div>
        <h1>model-prompt-tests bench report</h1>
        <p class="generated-at">Generated ${escapeHtml(generatedAt)}</p>
      </div>
      <button type="button" class="theme-toggle" aria-label="Toggle color theme">Auto</button>
    </header>

    ${renderStatTiles(data.summaries)}
    ${renderModelLegend(data.modelIds, seriesSlots)}
    ${renderChartsSection(data, seriesSlots)}

    <h2>Summary</h2>
    <p class="generated-at">Headline scores use peer judges only (self-judging excluded). Click column headers to sort.</p>
    <table class="summary-table sortable">
      <thead>
        <tr>
          <th data-sort-key="model">Model</th>
          <th data-sort-key="ok">OK</th>
          <th data-sort-key="errors">Errors</th>
          <th data-sort-key="missing">Missing judge</th>
          <th data-sort-key="score">Avg score (peer)</th>
          <th data-sort-key="self-score">Self score</th>
          <th data-sort-key="median">Median score</th>
          <th data-sort-key="score-stddev">Score σ</th>
          <th data-sort-key="repeat-var">Repeat variance</th>
          <th data-sort-key="agreement">Judge agreement</th>
          <th data-sort-key="latency">Avg latency ms</th>
          <th data-sort-key="median-latency">Median latency ms</th>
          <th data-sort-key="output-tokens">Avg output tokens</th>
          <th data-sort-key="judge-spread">Avg judge spread</th>
          <th data-sort-key="quality-per-sec">Quality / sec</th>
          <th data-sort-key="avg-cost">Avg cost</th>
          <th data-sort-key="cost">Total cost</th>
          <th data-sort-key="quality-per-dollar">Quality / $</th>
          <th data-sort-key="truncated">Truncated</th>
        </tr>
      </thead>
      <tbody>${renderSummaryRows(data.summaries)}</tbody>
    </table>
    ${renderDimensionAverages(data.summaries)}

    <h2>Prompt Details</h2>
    <table>
      <thead><tr><th>Prompt</th>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    ${sweSectionHtml}

    <footer class="methodology">
      <h2>Methodology notes</h2>
      <dl>
        <dt>Score (peer)</dt>
        <dd>Median of peer judge scores per run (self-judging excluded), then aggregated across cells. This is the headline number used in charts and badges.</dd>
        <dt>Score (self)</dt>
        <dd>Mean of scores a model gave its own output, shown separately because self-judging is a known bias risk.</dd>
        <dt>Cost</dt>
        <dd>Provider-reported billed cost when available (e.g. OpenRouter); otherwise computed from optional per-model pricing × tokens.</dd>
      </dl>
    </footer>
  </div>
  <script>${chartRuntimeScript()}</script>
</body>
</html>`;
}
