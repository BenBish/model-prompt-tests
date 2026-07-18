import { escapeHtml } from "../util/html";
import { formatNumber, formatPercent, scoreBadgeColor } from "../report/renderHtml";
import type { SweReportData, SweReportRow, SweSummary } from "./sweReportData";

function passBadgeColor(row: SweReportRow): string {
  if (row.runStatus === "error") return "#888";
  if (row.verifyPassed === true) return "#1a7f37";
  if (row.verifyPassed === false) return "#c62828";
  return "#888";
}

function renderSweRunDetails(row: SweReportRow): string {
  if (row.runStatus === "error") {
    return `<details><summary style="color:#c62828">error${row.repeatIndex > 0 ? ` (repeat ${row.repeatIndex + 1})` : ""}</summary><pre>${escapeHtml(row.error)}</pre></details>`;
  }

  const badgeColor = passBadgeColor(row);
  const label = row.verifyPassed === true ? "pass" : row.verifyPassed === false ? "fail" : "?";
  const meta = [
    row.startedAt,
    `batch ${row.runBatchId}`,
    row.repeatIndex > 0 ? `repeat ${row.repeatIndex + 1}` : undefined,
    row.latencyMs !== undefined ? `${row.latencyMs}ms agent` : undefined,
    row.agentTimedOut ? "agent timed out" : undefined,
    row.filesChanged !== undefined
      ? `${row.filesChanged} file(s), +${row.linesAdded ?? 0}/-${row.linesRemoved ?? 0}`
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  const judgeHtml = row.judgeResults
    .map((judge) => {
      if (judge.judgeStatus === "error") {
        return `<h4 style="color:#c62828">Judge error (${escapeHtml(judge.judgeModelId)})</h4><pre>${escapeHtml(judge.judgeError)}</pre>`;
      }
      const dimensionsHtml =
        judge.dimensions && Object.keys(judge.dimensions).length > 0
          ? `<ul class="dimensions">${Object.entries(judge.dimensions)
              .map(
                ([id, dim]) =>
                  `<li><span class="badge" style="background:${scoreBadgeColor(dim.score)}">${dim.score}</span> <b>${escapeHtml(id)}</b>: ${escapeHtml(dim.rationale)}</li>`,
              )
              .join("")}</ul>`
          : "";
      return `<h4>Judge ${escapeHtml(judge.judgeModelId)}: ${judge.score ?? "?"}</h4><pre>${escapeHtml(judge.rationale)}</pre>${dimensionsHtml}`;
    })
    .join("");

  return `
    <details>
      <summary><span class="badge" style="background:${badgeColor}">${label}</span> ${escapeHtml(meta)}</summary>
      <div class="run-detail">
        <h4>Agent final message</h4>
        <pre>${escapeHtml(row.finalMessage ?? "")}</pre>
        <h4>Diff</h4>
        <pre>${escapeHtml(row.diffPatch || "(no changes)")}</pre>
        <h4>Verify (${escapeHtml(row.verifyCommand ?? "?")})</h4>
        <pre>${escapeHtml(row.verifyOutput || "(no output)")}</pre>
        ${judgeHtml}
      </div>
    </details>
  `;
}

function renderSweCell(rows: SweReportRow[] | undefined): string {
  if (!rows || rows.length === 0) return `<td class="empty">—</td>`;
  return `<td>${rows.map(renderSweRunDetails).join("<hr/>")}</td>`;
}

function renderSweSummaryRows(summaries: SweSummary[]): string {
  return summaries
    .map(
      (summary) => `
        <tr>
          <th>${escapeHtml(summary.harnessModelId)}</th>
          <td>${summary.totalRuns}</td>
          <td>${summary.okRuns}</td>
          <td>${summary.errorRuns}</td>
          <td>${summary.passedRuns}</td>
          <td>${summary.failedRuns}</td>
          <td>${formatPercent(summary.passRate)}</td>
          <td>${formatNumber(summary.avgJudgeScore)}</td>
          <td>${formatNumber(summary.medianJudgeScore)}</td>
          <td>${formatNumber(summary.avgAgentLatencyMs, 0)}</td>
          <td>${formatNumber(summary.avgDiffLines, 1)}</td>
          <td>${summary.timeouts}</td>
        </tr>
      `,
    )
    .join("");
}

export function renderSweAssessmentSection(data: SweReportData): string {
  if (data.taskIds.length === 0) return "";

  const header =
    "| Harness:Model | Total | OK | Errors | Passed | Failed | Pass rate | Avg judge score | Median judge score | Avg agent ms | Avg diff lines | Timeouts |\n" +
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |";
  const rows = data.summaries.map(
    (summary) =>
      `| \`${summary.harnessModelId}\` | ${summary.totalRuns} | ${summary.okRuns} | ${summary.errorRuns} | ` +
      `${summary.passedRuns} | ${summary.failedRuns} | ${formatPercent(summary.passRate)} | ` +
      `${formatNumber(summary.avgJudgeScore)} | ${formatNumber(summary.medianJudgeScore)} | ` +
      `${formatNumber(summary.avgAgentLatencyMs, 0)} | ${formatNumber(summary.avgDiffLines, 1)} | ${summary.timeouts} |`,
  );

  const errorLines: string[] = [];
  for (const taskId of data.taskIds) {
    const byModel = data.rows.get(taskId)!;
    for (const [harnessModelId, rows] of byModel) {
      for (const row of rows) {
        if (row.runStatus === "error") {
          errorLines.push(`- \`${taskId}\` x \`${harnessModelId}\`: ${row.error ?? "unknown error"}`);
        }
      }
    }
  }

  const sections = [`## SWE Task Summary\n\n${[header, ...rows].join("\n")}`];
  if (errorLines.length > 0) {
    sections.push(`## SWE Task Errors\n\n${errorLines.join("\n")}`);
  }
  return sections.join("\n\n");
}

/** Returns an HTML fragment (no <html>/<body>) to embed inside the main report, or "" if there's no SWE data. */
export function renderSweReportSection(data: SweReportData): string {
  if (data.taskIds.length === 0) return "";

  const headerCells = data.harnessModelIds.map((id) => `<th>${escapeHtml(id)}</th>`).join("");
  const bodyRows = data.taskIds
    .map((taskId) => {
      const byModel = data.rows.get(taskId)!;
      const cells = data.harnessModelIds.map((id) => renderSweCell(byModel.get(id))).join("");
      return `<tr><th class="prompt-id">${escapeHtml(taskId)}</th>${cells}</tr>`;
    })
    .join("");

  return `
  <h2>SWE Task Summary</h2>
  <table class="summary-table">
    <thead>
      <tr>
        <th>Harness:Model</th>
        <th>Total</th>
        <th>OK</th>
        <th>Errors</th>
        <th>Passed</th>
        <th>Failed</th>
        <th>Pass rate</th>
        <th>Avg judge score</th>
        <th>Median judge score</th>
        <th>Avg agent ms</th>
        <th>Avg diff lines</th>
        <th>Timeouts</th>
      </tr>
    </thead>
    <tbody>${renderSweSummaryRows(data.summaries)}</tbody>
  </table>
  <h2>SWE Task Details</h2>
  <table>
    <thead><tr><th>Task</th>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  `;
}
