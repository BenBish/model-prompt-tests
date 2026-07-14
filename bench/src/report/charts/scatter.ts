import { escapeHtml } from "../../util/html";
import { seriesVar } from "./palette";
import { formatCompactNumber, linearScale, niceTicks, selfClose } from "./svg";

export interface ScatterPoint {
  modelId: string;
  x: number;
  y: number;
  tooltipLines: string[];
}

export interface ScatterChartOptions {
  width?: number;
  height?: number;
  xLabel: string;
  xFormat?: (value: number) => string;
  /** Model -> fixed categorical slot, shared across every chart in the report so color follows the entity. */
  slots: Map<string, number>;
  emptyMessage?: string;
}

const PADDING = { top: 16, right: 24, bottom: 44, left: 48 };

function tipAttr(title: string, lines: string[]): string {
  return escapeHtml(JSON.stringify({ title, lines }));
}

/**
 * Quality-vs-efficiency frontier: one point per model (score vs cost or
 * latency), with a Pareto frontier line connecting the non-dominated models
 * (lower x, higher-or-equal y). Model is the entity here, so points use the
 * fixed categorical color assigned to that model everywhere in the report.
 */
export function renderFrontierScatter(points: ScatterPoint[], options: ScatterChartOptions): string {
  const width = options.width ?? 640;
  const height = options.height ?? 360;
  if (points.length === 0) {
    return `<p class="chart-empty">${escapeHtml(options.emptyMessage ?? "No scored runs yet.")}</p>`;
  }

  const slots = options.slots;
  const xFormat = options.xFormat ?? formatCompactNumber;

  const maxX = Math.max(...points.map((p) => p.x), 0);
  const xScale = linearScale([0, maxX * 1.15 || 1], [PADDING.left, width - PADDING.right]);
  const yScale = linearScale([1, 5], [height - PADDING.bottom, PADDING.top]);

  const xTicks = niceTicks(0, maxX, 5).filter((t) => t <= maxX * 1.15 || t === 0);
  const yTicks = [1, 2, 3, 4, 5];

  const gridLines = [
    ...yTicks.map(
      (t) =>
        `<line x1="${PADDING.left}" x2="${width - PADDING.right}" y1="${yScale(t)}" y2="${yScale(t)}" class="grid-line" />`,
    ),
  ].join("");

  const xAxisLabels = xTicks
    .map(
      (t) =>
        `<text x="${xScale(t)}" y="${height - PADDING.bottom + 20}" class="axis-label" text-anchor="middle">${escapeHtml(xFormat(t))}</text>`,
    )
    .join("");
  const yAxisLabels = yTicks
    .map(
      (t) =>
        `<text x="${PADDING.left - 10}" y="${yScale(t) + 4}" class="axis-label" text-anchor="end">${t}</text>`,
    )
    .join("");

  // Pareto frontier: sort by x ascending, keep points whose y is a new max so far.
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const frontier: ScatterPoint[] = [];
  let bestY = -Infinity;
  for (const point of sorted) {
    if (point.y > bestY) {
      frontier.push(point);
      bestY = point.y;
    }
  }
  const frontierPath =
    frontier.length > 1
      ? `<polyline points="${frontier.map((p) => `${xScale(p.x)},${yScale(p.y)}`).join(" ")}" class="frontier-line" />`
      : "";

  const markers = points
    .map((point) => {
      const slot = slots.get(point.modelId) ?? 0;
      const cx = xScale(point.x);
      const cy = yScale(point.y);
      const onFrontier = frontier.includes(point);
      return `
        <g class="scatter-point${onFrontier ? " on-frontier" : ""}" data-model="${escapeHtml(point.modelId)}">
          ${selfClose("circle", { cx, cy, r: 6, class: "point-mark", style: `fill:${seriesVar(slot)}` })}
          <text x="${cx + 10}" y="${cy + 4}" class="point-label">${escapeHtml(point.modelId)}</text>
          ${selfClose("circle", {
            cx,
            cy,
            r: 14,
            class: "hit-target",
            tabindex: 0,
            "data-tip": tipAttr(point.modelId, point.tooltipLines),
          })}
        </g>
      `;
    })
    .join("");

  return `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Score versus ${escapeHtml(options.xLabel)} scatter plot">
      ${gridLines}
      <line x1="${PADDING.left}" x2="${width - PADDING.right}" y1="${height - PADDING.bottom}" y2="${height - PADDING.bottom}" class="axis-line" />
      <line x1="${PADDING.left}" x2="${PADDING.left}" y1="${PADDING.top}" y2="${height - PADDING.bottom}" class="axis-line" />
      ${xAxisLabels}
      ${yAxisLabels}
      <text x="${(PADDING.left + width - PADDING.right) / 2}" y="${height - 6}" class="axis-title" text-anchor="middle">${escapeHtml(options.xLabel)}</text>
      <text x="${-(height / 2)}" y="14" class="axis-title" text-anchor="middle" transform="rotate(-90)">Score</text>
      ${frontierPath}
      ${markers}
    </svg>
  `;
}
