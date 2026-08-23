import { escapeHtml } from "../util/html";
import type { ModelSummary } from "./queryData";
import type { SweSummary } from "../swe/sweReportData";
import type { CompatibilityResult } from "../experiment/compatibility";
import type { StatisticalAnalysis } from "./statistics";
import {
  assignSeriesSlots,
  chartFigure,
  chartRuntimeScript,
  formatUsd,
  paletteStyleBlock,
  renderCompareChart,
  reportBaseStyles,
  type CompareRow,
} from "./charts";

function fmt(value: number | undefined, digits = 2): string {
  return value === undefined ? "—" : value.toFixed(digits);
}
function pct(value: number | undefined): string { return value === undefined ? "—" : `${(value * 100).toFixed(0)}%`; }

function delta(before: number | undefined, after: number | undefined, digits = 2): string {
  if (before === undefined || after === undefined) return "—";
  const d = after - before;
  return `${d >= 0 ? "+" : ""}${d.toFixed(digits)}`;
}

/**
 * Standalone batch-vs-batch comparison page: did a candidate model, judge
 * change, or prompt-set revision move the needle? Independent of the main
 * per-batch report so a comparison doesn't need to re-render every prompt
 * detail from both batches.
 */
export function renderCompareHtml(
  labelBefore: string,
  summariesBefore: ModelSummary[],
  labelAfter: string,
  summariesAfter: ModelSummary[],
  generatedAt: string,
  swe?: { before: SweSummary[]; after: SweSummary[]; statisticalAnalysis?: StatisticalAnalysis; compatibility?: CompatibilityResult },
): string {
  const modelIds = [...new Set([...summariesBefore.map((s) => s.modelId), ...summariesAfter.map((s) => s.modelId)])].sort();
  const slots = assignSeriesSlots(modelIds);

  const byModelBefore = new Map(summariesBefore.map((s) => [s.modelId, s]));
  const byModelAfter = new Map(summariesAfter.map((s) => [s.modelId, s]));

  const compareRows: CompareRow[] = modelIds.map((modelId) => ({
    modelId,
    before: byModelBefore.get(modelId)?.avgScore,
    after: byModelAfter.get(modelId)?.avgScore,
  }));

  const biggestMove = [...compareRows]
    .filter((r) => r.before !== undefined && r.after !== undefined)
    .sort((a, b) => Math.abs(b.after! - b.before!) - Math.abs(a.after! - a.before!))[0];

  const tableRows = modelIds
    .map((modelId) => {
      const before = byModelBefore.get(modelId);
      const after = byModelAfter.get(modelId);
      return `
        <tr>
          <th>${escapeHtml(modelId)}</th>
          <td>${fmt(before?.avgScore)}</td>
          <td>${fmt(after?.avgScore)}</td>
          <td>${delta(before?.avgScore, after?.avgScore)}</td>
          <td>${before?.totalCostUsd !== undefined ? formatUsd(before.totalCostUsd) : "—"}</td>
          <td>${after?.totalCostUsd !== undefined ? formatUsd(after.totalCostUsd) : "—"}</td>
          <td>${fmt(before?.avgLatencyMs, 0)}</td>
          <td>${fmt(after?.avgLatencyMs, 0)}</td>
        </tr>
      `;
    })
    .join("");
  const sweModelIds = swe ? [...new Set([...swe.before, ...swe.after].map((s) => s.harnessModelId))].sort() : [];
  const sweBefore = new Map(swe?.before.map((s) => [s.harnessModelId, s]) ?? []);
  const sweAfter = new Map(swe?.after.map((s) => [s.harnessModelId, s]) ?? []);
  const sweSection = sweModelIds.length ? `<h2>Objective SWE correctness</h2>
    <p>Pass@1 is task-weighted first-trial correctness. Repeated solve is observed across repeats; infrastructure and publication-blocked trials are separate.</p>
    <table class="summary-table"><thead><tr><th>Harness:model</th><th>Pass@1 (${escapeHtml(labelBefore)})</th><th>Pass@1 (${escapeHtml(labelAfter)})</th><th>Repeated solve before</th><th>Repeated solve after</th><th>Infra before/after</th><th>Blocked before/after</th></tr></thead><tbody>${sweModelIds.map((id) => {
      const before = sweBefore.get(id), after = sweAfter.get(id);
      return `<tr><th>${escapeHtml(id)}</th><td>${pct(before?.passAt1)}</td><td>${pct(after?.passAt1)}</td><td>${pct(before?.repeatedTrialSolveRate)}</td><td>${pct(after?.repeatedTrialSolveRate)}</td><td>${before?.infrastructureFailures ?? "—"} / ${after?.infrastructureFailures ?? "—"}</td><td>${before?.publicationBlockedRuns ?? "—"} / ${after?.publicationBlockedRuns ?? "—"}</td></tr>`;
    }).join("")}</tbody></table>` : "";
  const statisticalSection = swe?.statisticalAnalysis?.comparisons.length ? `<h2>Paired statistical verdicts</h2>
    <p>${swe.compatibility?.compatible === false ? "Experiments are incompatible; all comparisons are warning-path evidence only. " : ""}Deltas use matched tasks and hierarchical task/repeat bootstrap intervals.</p>
    <table class="summary-table"><thead><tr><th>Baseline → candidate</th><th>Matched</th><th>Coverage</th><th>Delta (95% CI)</th><th>W/L/T</th><th>Verdict</th></tr></thead><tbody>${swe.statisticalAnalysis.comparisons.map((c) => `<tr><th>${escapeHtml(c.baselineId)} → ${escapeHtml(c.candidateId)}</th><td>${c.matchedTasks}</td><td>${pct(c.coverage)}</td><td>${pct(c.delta)} (${pct(c.interval.low)} to ${pct(c.interval.high)})</td><td>${c.wins}/${c.losses}/${c.ties}</td><td>${swe.compatibility?.compatible === false ? "inconclusive" : c.verdict}</td></tr>`).join("")}</tbody></table>` : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>model-prompt-tests bench compare</title>
<style>
${reportBaseStyles()}
${paletteStyleBlock()}
</style>
</head>
<body>
  <div class="page viz-root">
    <header class="report-header">
      <div>
        <h1>Compare: ${escapeHtml(labelBefore)} &rarr; ${escapeHtml(labelAfter)}</h1>
        <p class="generated-at">Generated ${escapeHtml(generatedAt)}</p>
      </div>
      <button type="button" class="theme-toggle" aria-label="Toggle color theme">Auto</button>
    </header>
    ${sweSection}
    ${statisticalSection}

    <div class="stat-tiles">
      <div class="stat-tile">
        <div class="stat-label">Models compared</div>
        <div class="stat-value">${modelIds.length}</div>
      </div>
      ${
        biggestMove
          ? `<div class="stat-tile">
        <div class="stat-label">Biggest move</div>
        <div class="stat-value">${delta(biggestMove.before, biggestMove.after)}</div>
        <div class="stat-sub">${escapeHtml(biggestMove.modelId)}</div>
      </div>`
          : ""
      }
    </div>

    <div class="chart-card chart-card-wide">
      ${chartFigure(
        "Score change",
        `Peer-judged score in "${labelBefore}" (faint) vs "${labelAfter}" (solid) per model.`,
        renderCompareChart(compareRows, slots, labelBefore, labelAfter),
      )}
    </div>

    <h2>Delta table</h2>
    <table class="summary-table">
      <thead>
        <tr>
          <th>Model</th>
          <th>Score (${escapeHtml(labelBefore)})</th>
          <th>Score (${escapeHtml(labelAfter)})</th>
          <th>Δ score</th>
          <th>Cost (${escapeHtml(labelBefore)})</th>
          <th>Cost (${escapeHtml(labelAfter)})</th>
          <th>Latency ms (${escapeHtml(labelBefore)})</th>
          <th>Latency ms (${escapeHtml(labelAfter)})</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>
  <script>${chartRuntimeScript()}</script>
</body>
</html>`;
}
