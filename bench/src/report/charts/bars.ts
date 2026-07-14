import { escapeHtml } from "../../util/html";
import { seriesVar } from "./palette";
import { linearScale } from "./svg";

export interface BarRow {
  modelId: string;
  value: number;
  formattedValue: string;
}

const ROW_HEIGHT = 32;
const BAR_HEIGHT = 18;
const PADDING = { top: 8, right: 72, bottom: 8, left: 160 };

/**
 * Horizontal bar chart, one bar per model. Model is the entity (identity),
 * so bars use the same fixed categorical color the model has everywhere
 * else in the report, not a sequential magnitude ramp.
 */
export function renderBarChart(rows: BarRow[], slots: Map<string, number>, width = 520): string {
  const withValues = rows.filter((r) => Number.isFinite(r.value));
  if (withValues.length === 0) {
    return `<p class="chart-empty">No data yet.</p>`;
  }
  const sorted = [...withValues].sort((a, b) => b.value - a.value);
  const height = PADDING.top + PADDING.bottom + ROW_HEIGHT * sorted.length;
  const maxValue = Math.max(...sorted.map((r) => r.value), 0.000001);
  const xScale = linearScale([0, maxValue * 1.08], [PADDING.left, width - PADDING.right]);

  const bars = sorted
    .map((row, index) => {
      const rowY = PADDING.top + ROW_HEIGHT * index;
      const barY = rowY + (ROW_HEIGHT - BAR_HEIGHT) / 2;
      const slot = slots.get(row.modelId) ?? 0;
      const color = seriesVar(slot);
      const barEnd = xScale(row.value);
      const barWidth = Math.max(barEnd - PADDING.left, 2);
      return `
        <g class="bar-row" tabindex="0" data-model="${escapeHtml(row.modelId)}" data-tip='${escapeHtml(
          JSON.stringify({ title: row.modelId, lines: [row.formattedValue] }),
        )}'>
          <text x="${PADDING.left - 12}" y="${rowY + ROW_HEIGHT / 2 + 4}" class="bar-row-label" text-anchor="end">${escapeHtml(row.modelId)}</text>
          <rect x="${PADDING.left}" y="${barY}" width="${barWidth}" height="${BAR_HEIGHT}" rx="4" class="bar-mark" style="fill:${color}" />
          <text x="${barEnd + 8}" y="${rowY + ROW_HEIGHT / 2 + 4}" class="bar-value-label">${escapeHtml(row.formattedValue)}</text>
        </g>
      `;
    })
    .join("");

  return `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Bar chart by model">
      <line x1="${PADDING.left}" x2="${PADDING.left}" y1="${PADDING.top}" y2="${height - PADDING.bottom}" class="axis-line" />
      ${bars}
    </svg>
  `;
}
