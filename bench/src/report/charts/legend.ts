import { escapeHtml } from "../../util/html";
import { seriesVar } from "./palette";

/**
 * The one legend for the whole report: model -> fixed categorical color,
 * shared by every chart that encodes model identity (scatter, distribution,
 * bars). Doubles as the filter-chip row -- clicking a chip isolates that
 * model across the report (see runtime.ts).
 */
export function renderModelLegend(modelIds: string[], slots: Map<string, number>): string {
  if (modelIds.length === 0) return "";
  const chips = modelIds
    .map((modelId) => {
      const slot = slots.get(modelId) ?? 0;
      return `
        <button type="button" class="legend-chip" data-filter-model="${escapeHtml(modelId)}">
          <span class="legend-swatch" style="background:${seriesVar(slot)}"></span>
          <span>${escapeHtml(modelId)}</span>
        </button>
      `;
    })
    .join("");
  return `<div class="filter-bar" role="group" aria-label="Filter by model">${chips}</div>`;
}
