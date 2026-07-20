import { escapeHtml } from "../../util/html";
import { seriesVar } from "./palette";
import { linearScale, selfClose } from "./svg";

export interface ModelScoreDistribution {
  modelId: string;
  /** Individual per-run peer-judge-average scores (one per run, or per repeat attempt). */
  scores: number[];
}

const ROW_HEIGHT = 34;
const PADDING = { top: 12, right: 24, bottom: 32, left: 160 };

function tipAttr(modelId: string, scores: number[]): string {
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const lines = [
    `mean ${mean.toFixed(2)} (n=${scores.length})`,
    `range ${Math.min(...scores).toFixed(1)}–${Math.max(...scores).toFixed(1)}`,
  ];
  return escapeHtml(JSON.stringify({ title: modelId, lines }));
}

/**
 * One row per model: a range line from min to max score across runs/repeats,
 * individual run scores as small dots, and the mean as the larger marker.
 * Surfaces judge/run variance that a single averaged number hides.
 */
export function renderScoreDistribution(models: ModelScoreDistribution[], slots: Map<string, number>): string {
  const withScores = models.filter((m) => m.scores.length > 0);
  if (withScores.length === 0) {
    return `<p class="chart-empty">No scored runs yet.</p>`;
  }

  const width = 640;
  const height = PADDING.top + PADDING.bottom + ROW_HEIGHT * withScores.length;
  const xScale = linearScale([1, 5], [PADDING.left, width - PADDING.right]);

  const gridLines = [1, 2, 3, 4, 5]
    .map(
      (t) =>
        `<line x1="${xScale(t)}" x2="${xScale(t)}" y1="${PADDING.top}" y2="${height - PADDING.bottom}" class="grid-line" />`,
    )
    .join("");
  const xLabels = [1, 2, 3, 4, 5]
    .map(
      (t) => `<text x="${xScale(t)}" y="${height - PADDING.bottom + 20}" class="axis-label" text-anchor="middle">${t}</text>`,
    )
    .join("");

  const rows = withScores
    .map((model, index) => {
      const rowY = PADDING.top + ROW_HEIGHT * index + ROW_HEIGHT / 2;
      const slot = slots.get(model.modelId) ?? 0;
      const color = seriesVar(slot);
      const min = Math.min(...model.scores);
      const max = Math.max(...model.scores);
      const mean = model.scores.reduce((a, b) => a + b, 0) / model.scores.length;

      const rangeLine =
        min !== max
          ? `<line x1="${xScale(min)}" x2="${xScale(max)}" y1="${rowY}" y2="${rowY}" class="dist-range" style="stroke:${color}" />`
          : "";
      const dots = model.scores
        .map((s) => selfClose("circle", { cx: xScale(s), cy: rowY, r: 3, class: "dist-dot", style: `fill:${color}` }))
        .join("");
      const meanMarker = selfClose("circle", {
        cx: xScale(mean),
        cy: rowY,
        r: 7,
        class: "dist-mean",
        style: `fill:${color}`,
      });
      const hitTarget = selfClose("circle", {
        cx: xScale(mean),
        cy: rowY,
        r: 16,
        class: "hit-target",
        tabindex: 0,
        "data-tip": tipAttr(model.modelId, model.scores),
      });

      return `
        <g class="dist-row" data-model="${escapeHtml(model.modelId)}">
          <text x="${PADDING.left - 12}" y="${rowY + 4}" class="dist-row-label" text-anchor="end">${escapeHtml(model.modelId)}</text>
          ${rangeLine}
          ${dots}
          ${meanMarker}
          ${hitTarget}
        </g>
      `;
    })
    .join("");

  return `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Score distribution per model">
      ${gridLines}
      <line x1="${PADDING.left}" x2="${width - PADDING.right}" y1="${height - PADDING.bottom}" y2="${height - PADDING.bottom}" class="axis-line" />
      ${xLabels}
      <text x="${(PADDING.left + width - PADDING.right) / 2}" y="${height - 6}" class="axis-title" text-anchor="middle">Score</text>
      ${rows}
    </svg>
  `;
}
