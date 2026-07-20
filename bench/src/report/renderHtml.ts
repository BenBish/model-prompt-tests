import { escapeHtml } from "../util/html";
import {
  median,
  perRunMedianScore,
  type JudgeReportRow,
  type ModelSummary,
  type ReportData,
  type ReportRow,
} from "./queryData";

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

function renderCell(rows: ReportRow[] | undefined): string {
  if (!rows || rows.length === 0) return `<td class="empty">—</td>`;

  // Compute each ok row's score once and reuse it for both the cell summary and its own badge.
  const scoresByRunId = new Map<number, number | undefined>();
  const okScores: number[] = [];
  for (const row of rows) {
    if (row.runStatus !== "ok") continue;
    const score = perRunMedianScore(row);
    scoresByRunId.set(row.runId, score);
    if (score !== undefined) okScores.push(score);
  }

  const details = rows.map((row) => renderRunDetails(row, scoresByRunId.get(row.runId))).join("<hr/>");
  return `<td>${renderCellSummary(rows, okScores)}${details}</td>`;
}

export function formatNumber(value: number | undefined, digits = 2): string {
  return value === undefined ? "—" : value.toFixed(digits);
}

export function formatPercent(value: number | undefined): string {
  return value === undefined ? "—" : `${(value * 100).toFixed(0)}%`;
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
      return `<tr><th>${escapeHtml(summary.modelId)}</th>${cells}</tr>`;
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
        <tr>
          <th>${escapeHtml(summary.modelId)}</th>
          <td>${summary.okRuns}</td>
          <td>${summary.errorRuns}</td>
          <td>${summary.missingJudgeScores}</td>
          <td>${formatNumber(summary.avgScore)}</td>
          <td>${formatNumber(summary.medianScore)}</td>
          <td>${formatNumber(summary.scoreStdDev)}</td>
          <td>${formatNumber(summary.repeatVariance)}</td>
          <td>${formatPercent(summary.judgeAgreementPct)}</td>
          <td>${formatNumber(summary.avgLatencyMs, 0)}</td>
          <td>${formatNumber(summary.medianLatencyMs, 0)}</td>
          <td>${formatNumber(summary.avgOutputTokens, 0)}</td>
          <td>${formatNumber(summary.avgJudgeSpread)}</td>
          <td>${formatNumber(summary.qualityPerSecond, 3)}</td>
        </tr>
      `,
    )
    .join("");
}

export function renderReportHtml(data: ReportData, generatedAt: string, sweSectionHtml = ""): string {
  const headerCells = data.modelIds.map((modelId) => `<th>${escapeHtml(modelId)}</th>`).join("");

  const bodyRows = data.promptIds
    .map((promptId) => {
      const byModel = data.rows.get(promptId)!;
      const cells = data.modelIds.map((modelId) => renderCell(byModel.get(modelId))).join("");
      return `<tr><th class="prompt-id">${escapeHtml(promptId)}</th>${cells}</tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>model-prompt-tests bench report</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 2rem; background: #fff; color: #111; }
  @media (prefers-color-scheme: dark) {
    body { background: #16181c; color: #e6e6e6; }
    table { border-color: #333 !important; }
    th, td { border-color: #333 !important; }
    pre { background: #1f2228 !important; color: #ddd !important; }
  }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 0.5rem; vertical-align: top; text-align: left; }
  th.prompt-id { white-space: nowrap; font-family: monospace; }
  td.empty { text-align: center; color: #999; }
  .badge { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 0.75rem; color: #fff; font-weight: bold; }
  pre { white-space: pre-wrap; word-break: break-word; background: #f5f5f5; padding: 0.5rem; border-radius: 0.25rem; max-height: 24rem; overflow-y: auto; }
  summary { cursor: pointer; }
  .run-detail h4 { margin-bottom: 0.25rem; }
  hr { border: none; border-top: 1px dashed #ccc; margin: 0.5rem 0; }
  .generated-at { color: #666; font-size: 0.85rem; }
  .summary-table { margin-bottom: 2rem; }
  .cell-summary { font-size: 0.8rem; color: #666; margin-bottom: 0.35rem; }
  ul.dimensions { margin: 0.25rem 0; padding-left: 1.25rem; }
  ul.dimensions li { margin-bottom: 0.15rem; }
  p.weighted-score { font-size: 0.85rem; color: #666; margin: 0.15rem 0 0.5rem; }
</style>
</head>
<body>
  <h1>model-prompt-tests bench report</h1>
  <p class="generated-at">Generated ${escapeHtml(generatedAt)}</p>
  <h2>Summary</h2>
  <table class="summary-table">
    <thead>
      <tr>
        <th>Model</th>
        <th>OK</th>
        <th>Errors</th>
        <th>Missing judge scores</th>
        <th>Avg score</th>
        <th>Median score</th>
        <th>Score stddev</th>
        <th>Repeat variance</th>
        <th>Judge agreement</th>
        <th>Avg latency ms</th>
        <th>Median latency ms</th>
        <th>Avg output tokens</th>
        <th>Avg judge spread</th>
        <th>Quality / sec</th>
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
</body>
</html>`;
}
