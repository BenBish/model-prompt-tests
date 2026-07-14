import { escapeHtml } from "../util/html";
import type { JudgeReportRow, ModelSummary, ReportData, ReportRow } from "./queryData";
import { runPeerAverage } from "./queryData";
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
  type ModelScoreDistribution,
  type ScatterPoint,
} from "./charts";

function scoreBadgeColor(score: number | undefined): string {
  if (score === undefined) return "#888";
  if (score >= 5) return "#1a7f37";
  if (score >= 4) return "#4c9a2a";
  if (score >= 3) return "#b08800";
  if (score >= 2) return "#c2680a";
  return "#c62828";
}

function renderRunDetails(row: ReportRow): string {
  if (row.runStatus === "error") {
    return `<details><summary style="color:#c62828">error</summary><pre>${escapeHtml(row.error)}</pre></details>`;
  }

  const scores = row.judgeResults.flatMap((judge) => (judge.score === undefined ? [] : [judge.score]));
  const avgScore = scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : undefined;
  const badgeColor = scoreBadgeColor(avgScore);
  const summaryLabel = avgScore !== undefined ? avgScore.toFixed(2) : "?";
  const meta = [
    row.startedAt,
    `batch ${row.runBatchId}`,
    row.attempt > 1 ? `attempt ${row.attempt}` : undefined,
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
    <details>
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
  return `
    <h4>Judge ${escapeHtml(judge.judgeModelId)}${selfJudgeSuffix}: ${judge.score ?? "?"}</h4>
    <pre>${escapeHtml(judge.rationale)}</pre>
  `;
}

function renderCell(modelId: string, rows: ReportRow[] | undefined): string {
  if (!rows || rows.length === 0) return `<td class="empty" data-model="${escapeHtml(modelId)}">—</td>`;
  return `<td data-model="${escapeHtml(modelId)}">${rows.map(renderRunDetails).join("<hr/>")}</td>`;
}

function formatNumber(value: number | undefined, digits = 2): string {
  return value === undefined ? "—" : value.toFixed(digits);
}

function sortableCell(value: number | undefined, digits: number, colKey: string): string {
  const display = formatNumber(value, digits);
  return `<td data-col="${colKey}" data-value="${value ?? ""}">${display}</td>`;
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
          ${sortableCell(summary.scoreStdDev, 2, "score-stddev")}
          ${sortableCell(summary.avgLatencyMs, 0, "latency")}
          ${sortableCell(summary.avgOutputTokens, 0, "output-tokens")}
          ${sortableCell(summary.avgJudgeSpread, 2, "judge-spread")}
          ${sortableCell(summary.qualityPerSecond, 3, "quality-per-sec")}
          <td data-col="cost" data-value="${summary.totalCostUsd ?? ""}">${
            summary.totalCostUsd !== undefined ? formatUsd(summary.totalCostUsd) : "—"
          }</td>
          ${sortableCell(summary.qualityPerDollar, 1, "quality-per-dollar")}
          <td data-col="truncated" data-value="${summary.truncatedRuns}">${summary.truncatedRuns}</td>
        </tr>
      `,
    )
    .join("");
}

function renderStatTiles(summaries: ModelSummary[]): string {
  const scored = summaries.filter((s) => s.avgScore !== undefined);
  const winner = scored.length > 0 ? scored.reduce((a, b) => ((b.avgScore ?? 0) > (a.avgScore ?? 0) ? b : a)) : undefined;
  const totalCost = summaries.reduce((sum, s) => sum + (s.totalCostUsd ?? 0), 0);
  const hasCost = summaries.some((s) => s.totalCostUsd !== undefined);
  const totalTruncated = summaries.reduce((sum, s) => sum + s.truncatedRuns, 0);
  const totalOkRuns = summaries.reduce((sum, s) => sum + s.okRuns, 0);

  const tiles = [
    { label: "Models tested", value: String(summaries.length) },
    winner
      ? { label: "Top score", value: `${winner.avgScore!.toFixed(2)}`, sub: winner.modelId }
      : { label: "Top score", value: "—" },
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
      tooltipLines: [`score ${s.avgScore!.toFixed(2)}`, `${(s.avgLatencyMs! / 1000).toFixed(1)}s / run`, `${s.okRuns} ok runs`],
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
        const peerAvg = runPeerAverage(row);
        if (peerAvg === undefined) continue;
        const list = byModel.get(modelId) ?? [];
        list.push(peerAvg);
        byModel.set(modelId, list);
      }
    }
  }
  return data.modelIds.map((modelId) => ({ modelId, scores: byModel.get(modelId) ?? [] }));
}

function renderChartsSection(data: ReportData, slots: Map<string, number>): string {
  const costScatter = buildCostScatter(data.summaries);
  const latencyScatter = buildLatencyScatter(data.summaries);
  const distribution = buildDistribution(data);
  const costBars = buildCostBars(data.summaries);

  return `
    <div class="chart-grid">
      <div class="chart-card chart-card-wide">
        ${chartFigure(
          "Quality vs. cost",
          "Score against average cost per run. The dashed line traces the Pareto frontier -- models no other model beats on both axes.",
          renderFrontierScatter(costScatter, {
            xLabel: "Cost per run (USD)",
            xFormat: (v) => formatUsd(v),
            slots,
            width: 1080,
            height: 300,
            emptyMessage: "No cost data -- add pricing to models.json or use an OpenRouter model to see this chart.",
          }),
        )}
      </div>
      <div class="chart-card">
        ${chartFigure(
          "Quality vs. latency",
          "Score against average wall-clock latency per run.",
          renderFrontierScatter(latencyScatter, { xLabel: "Latency (s)", xFormat: (v) => `${v.toFixed(1)}s`, slots }),
        )}
      </div>
      <div class="chart-card">
        ${chartFigure(
          "Score distribution",
          "Range across runs/judges per model -- dot is each run, large marker is the mean. Wide ranges mean high variance.",
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
          "Every prompt x model cell, colored by average score (blue = strong, red = weak, centered on the rubric midpoint).",
          renderScoreHeatmap(data.promptIds, data.modelIds, data.promptSummaries),
        )}
      </div>
    </div>
  `;
}

export function renderReportHtml(data: ReportData, generatedAt: string): string {
  // Computed once from the full model list so every chart -- even after
  // filtering out models with no cost data, say -- paints the same model
  // with the same color throughout the report.
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
    <table class="summary-table sortable">
      <thead>
        <tr>
          <th data-sort-key="model">Model</th>
          <th data-sort-key="ok">OK</th>
          <th data-sort-key="errors">Errors</th>
          <th data-sort-key="missing">Missing judge</th>
          <th data-sort-key="score">Score (peer)</th>
          <th data-sort-key="self-score">Score (self)</th>
          <th data-sort-key="score-stddev">Score σ</th>
          <th data-sort-key="latency">Avg latency ms</th>
          <th data-sort-key="output-tokens">Avg output tokens</th>
          <th data-sort-key="judge-spread">Avg judge spread</th>
          <th data-sort-key="quality-per-sec">Quality / sec</th>
          <th data-sort-key="cost">Total cost</th>
          <th data-sort-key="quality-per-dollar">Quality / $</th>
          <th data-sort-key="truncated">Truncated</th>
        </tr>
      </thead>
      <tbody>${renderSummaryRows(data.summaries)}</tbody>
    </table>

    <h2>Prompt Details</h2>
    <table>
      <thead><tr><th>Prompt</th>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>

    <footer class="methodology">
      <h2>Methodology notes</h2>
      <dl>
        <dt>Score (peer)</dt>
        <dd>Mean of judge scores, excluding any judge that is also the candidate model being judged. This is the headline number used everywhere else in this report.</dd>
        <dt>Score (self)</dt>
        <dd>Mean of scores a model gave its own output, shown separately since a model judging itself is a known bias risk.</dd>
        <dt>Score σ</dt>
        <dd>Standard deviation of per-run peer scores. Only meaningful with multiple runs per prompt (via --repeats) or multiple judges.</dd>
        <dt>Quality / sec, Quality / $</dt>
        <dd>Score divided by average latency (seconds) or average cost (USD). Latency and cost are harness-measured for this run and are only comparable within the same batch, not across different hardware or time periods.</dd>
        <dt>Truncated</dt>
        <dd>Runs whose stop reason indicates the model hit its output token limit rather than finishing naturally.</dd>
      </dl>
    </footer>
  </div>
  <script>${chartRuntimeScript()}</script>
</body>
</html>`;
}
