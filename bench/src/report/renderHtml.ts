import { escapeHtml } from "../util/html";
import type { ReportData, ReportRow } from "./queryData";

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

  const badgeColor = scoreBadgeColor(row.score);
  const summaryLabel = row.score !== undefined ? String(row.score) : "?";
  const meta = [
    row.startedAt,
    `batch ${row.runBatchId}`,
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
        ${
          row.rationale
            ? `<h4>Judge rationale (${escapeHtml(row.judgeModelId)})</h4><pre>${escapeHtml(row.rationale)}</pre>`
            : ""
        }
        ${
          row.judgeError
            ? `<h4 style="color:#c62828">Judge error (${escapeHtml(row.judgeModelId)})</h4><pre>${escapeHtml(row.judgeError)}</pre>`
            : ""
        }
      </div>
    </details>
  `;
}

function renderCell(rows: ReportRow[] | undefined): string {
  if (!rows || rows.length === 0) return `<td class="empty">—</td>`;
  return `<td>${rows.map(renderRunDetails).join("<hr/>")}</td>`;
}

export function renderReportHtml(data: ReportData, generatedAt: string): string {
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
</style>
</head>
<body>
  <h1>model-prompt-tests bench report</h1>
  <p class="generated-at">Generated ${escapeHtml(generatedAt)}</p>
  <table>
    <thead><tr><th>Prompt</th>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;
}
