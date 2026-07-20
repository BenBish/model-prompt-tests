import { escapeHtml } from "../../util/html";
import { seriesVar } from "./palette";
import { linearScale, selfClose } from "./svg";

export interface CompareRow {
  modelId: string;
  before?: number;
  after?: number;
}

const ROW_HEIGHT = 34;
const PADDING = { top: 12, right: 24, bottom: 32, left: 200 };

/**
 * Batch-vs-batch score delta: a dumbbell per model connecting its score in
 * the "before" batch to its score in the "after" batch. Model is the entity
 * (identity), so it keeps its fixed categorical color; the connecting line
 * itself is neutral, and only its direction (up/down) is meaningful.
 */
export function renderCompareChart(rows: CompareRow[], slots: Map<string, number>, beforeLabel: string, afterLabel: string): string {
  const withBoth = rows.filter((r) => r.before !== undefined && r.after !== undefined);
  if (withBoth.length === 0) {
    return `<p class="chart-empty">No models scored in both batches.</p>`;
  }

  const width = 640;
  const height = PADDING.top + PADDING.bottom + ROW_HEIGHT * withBoth.length;
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

  const rowsSvg = withBoth
    .map((row, index) => {
      const rowY = PADDING.top + ROW_HEIGHT * index + ROW_HEIGHT / 2;
      const slot = slots.get(row.modelId) ?? 0;
      const color = seriesVar(slot);
      const beforeX = xScale(row.before!);
      const afterX = xScale(row.after!);
      const delta = row.after! - row.before!;
      const deltaLabel = `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;
      const tip = escapeHtml(
        JSON.stringify({
          title: row.modelId,
          lines: [`${beforeLabel}: ${row.before!.toFixed(2)}`, `${afterLabel}: ${row.after!.toFixed(2)}`, `delta ${deltaLabel}`],
        }),
      );

      return `
        <g class="compare-row" data-model="${escapeHtml(row.modelId)}" tabindex="0" data-tip='${tip}'>
          <text x="${PADDING.left - 12}" y="${rowY + 4}" class="dist-row-label" text-anchor="end">${escapeHtml(row.modelId)}</text>
          <line x1="${beforeX}" x2="${afterX}" y1="${rowY}" y2="${rowY}" class="compare-connector" />
          ${selfClose("circle", { cx: beforeX, cy: rowY, r: 6, class: "point-mark compare-before", style: `fill:${color};opacity:0.45` })}
          ${selfClose("circle", { cx: afterX, cy: rowY, r: 7, class: "point-mark", style: `fill:${color}` })}
          <text x="${afterX + 12}" y="${rowY + 4}" class="point-label${delta >= 0 ? " delta-up" : " delta-down"}">${deltaLabel}</text>
        </g>
      `;
    })
    .join("");

  return `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Score change from ${escapeHtml(beforeLabel)} to ${escapeHtml(afterLabel)}">
      ${gridLines}
      <line x1="${PADDING.left}" x2="${width - PADDING.right}" y1="${height - PADDING.bottom}" y2="${height - PADDING.bottom}" class="axis-line" />
      ${xLabels}
      <text x="${(PADDING.left + width - PADDING.right) / 2}" y="${height - 6}" class="axis-title" text-anchor="middle">Score (faint = ${escapeHtml(beforeLabel)}, solid = ${escapeHtml(afterLabel)})</text>
      ${rowsSvg}
    </svg>
  `;
}
