import { escapeHtml } from "../util/html";
import { formatNumber, formatPercent, scoreBadgeColor } from "../report/renderHtml";
import type { SweReportData, SweReportRow, SweSummary } from "./sweReportData";

function passBadgeColor(row: SweReportRow): string {
  if (row.runStatus === "error") return "#888";
  if (row.reviewMetrics) {
    const f1 = row.reviewMetrics.f1 ?? 0;
    if (f1 >= 0.75) return "#1a7f37";
    if (f1 >= 0.4) return "#b8860b";
    return "#c62828";
  }
  if (row.verifyPassed === true) return "#1a7f37";
  if (row.verifyPassed === false) return "#c62828";
  return "#888";
}

function runBadgeLabel(row: SweReportRow): string {
  if (row.reviewMetrics) {
    const f1 = row.reviewMetrics.f1;
    return f1 === undefined ? "review" : `F1 ${formatNumber(f1)}`;
  }
  if (row.verifyPassed === true && row.agentTimedOut) return "verified / timed out";
  if (row.verifyPassed === true) return "clean pass";
  if (row.verifyPassed === false) {
    return row.verifyTestsTotal !== undefined
      ? `fail (${row.verifyTestsPassed ?? 0}/${row.verifyTestsTotal})`
      : "fail";
  }
  return "?";
}

function renderSweRunDetails(row: SweReportRow): string {
  if (row.runStatus === "error") {
    return `<details><summary style="color:#c62828">error${row.repeatIndex > 0 ? ` (repeat ${row.repeatIndex + 1})` : ""}</summary><pre>${escapeHtml(row.error)}</pre></details>`;
  }

  const badgeColor = passBadgeColor(row);
  const label = runBadgeLabel(row);
  const meta = [
    row.startedAt,
    `batch ${row.runBatchId}`,
    row.repeatIndex > 0 ? `repeat ${row.repeatIndex + 1}` : undefined,
    row.latencyMs !== undefined ? `${row.latencyMs}ms agent` : undefined,
    row.agentTimedOut ? "agent timed out" : undefined,
    row.reviewMetrics
      ? `R ${formatNumber(row.reviewMetrics.recall)} · P ${formatNumber(row.reviewMetrics.precision)} · F1 ${formatNumber(row.reviewMetrics.f1)}`
      : undefined,
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

  const reviewMetricsHtml = row.reviewMetrics
    ? `<h4>Review metrics</h4><pre>${escapeHtml(JSON.stringify(row.reviewMetrics, null, 2))}</pre>`
    : "";

  const verifyHtml = row.reviewMetrics
    ? ""
    : `<h4>Verify (${escapeHtml(row.verifyCommand ?? "?")})</h4>
        <pre>${escapeHtml(row.verifyOutput || "(no output)")}</pre>`;

  return `
    <details>
      <summary><span class="badge" style="background:${badgeColor}">${escapeHtml(label)}</span> ${escapeHtml(meta)}</summary>
      <div class="run-detail">
        <h4>Agent final message</h4>
        <pre>${escapeHtml(row.finalMessage ?? "")}</pre>
        <h4>Diff</h4>
        <pre>${escapeHtml(row.diffPatch || "(no changes)")}</pre>
        ${verifyHtml}
        ${reviewMetricsHtml}
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
          <td>${summary.cleanPassedRuns}</td>
          <td>${summary.verifiedTimedOutRuns}</td>
          <td>${formatPercent(summary.cleanPassRate)}</td>
          <td>${formatPercent(summary.avgVerifyPassRate)}</td>
          <td>${formatNumber(summary.avgJudgeScore)}</td>
          <td>${formatNumber(summary.medianJudgeScore)}</td>
          <td>${formatNumber(summary.avgRecall)}</td>
          <td>${formatNumber(summary.avgPrecision)}</td>
          <td>${formatNumber(summary.avgF1)}</td>
          <td>${formatNumber(summary.avgAgentLatencyMs, 0)}</td>
          <td>${formatNumber(summary.avgDecodeTokensPerSec, 1)}</td>
          <td>${formatNumber(summary.avgPromptTokensPerSec, 1)}</td>
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
    "| Harness:Model | Total | OK | Errors | Verify passed | Verify failed | Verify rate | Clean passed | Verified after timeout | Clean pass rate | Avg test pass % | Avg judge | Median judge | Avg recall | Avg precision | Avg F1 | Avg agent ms | Decode tok/s | Prompt tok/s | Avg diff lines | Timeouts |\n" +
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |";
  const rows = data.summaries.map(
    (summary) =>
      `| \`${summary.harnessModelId}\` | ${summary.totalRuns} | ${summary.okRuns} | ${summary.errorRuns} | ` +
      `${summary.passedRuns} | ${summary.failedRuns} | ${formatPercent(summary.passRate)} | ` +
      `${summary.cleanPassedRuns} | ${summary.verifiedTimedOutRuns} | ${formatPercent(summary.cleanPassRate)} | ` +
      `${formatPercent(summary.avgVerifyPassRate)} | ` +
      `${formatNumber(summary.avgJudgeScore)} | ${formatNumber(summary.medianJudgeScore)} | ` +
      `${formatNumber(summary.avgRecall)} | ${formatNumber(summary.avgPrecision)} | ${formatNumber(summary.avgF1)} | ` +
      `${formatNumber(summary.avgAgentLatencyMs, 0)} | ${formatNumber(summary.avgDecodeTokensPerSec, 1)} | ` +
      `${formatNumber(summary.avgPromptTokensPerSec, 1)} | ${formatNumber(summary.avgDiffLines, 1)} | ${summary.timeouts} |`,
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
  sections.push(
    [
      "### Metric notes",
      "",
      "- **Verify rate** is binary: the fraction of runs where the whole verify command exited 0.",
      "- **Avg test pass %** is partial credit: the mean fraction of individual hidden/visible tests passed per run, parsed from `bun test`'s summary. It stays informative even when every run in a cell fails Verify rate outright, and reads as `—` for any verify command other than `bun test`.",
      "- **Avg/median judge** measures process and code quality on top of a verify result that's already known — it does not re-derive correctness, so don't read a high judge score as evidence a failing run actually worked.",
    ].join("\n"),
  );
  if (data.summaries.some((s) => s.reviewRuns > 0)) {
    sections.push(
      [
        "### Code-review metric notes",
        "",
        "- **Recall** is severity-weighted (high=3, med=2, low=1).",
        "- **Precision** is unweighted claim-count: TP / (TP + plausible extra findings).",
        "- **F1** combines those two scales; compare models relative to each other rather than to a 0–1 ideal absolute.",
        "- Code-review tasks have no hidden-test verify step, so Passed/Failed/Pass rate stay empty unless mixed with fixture/external tasks.",
      ].join("\n"),
    );
  }
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

  const metricNotesParts = [
    `<p class="muted"><b>Verify rate</b> is binary (whole run passed or not). <b>Avg test pass %</b> is partial credit — the mean fraction of individual hidden/visible tests passed per run (parsed from <code>bun test</code>'s summary; shows as "—" for other verify commands) — so it can separate models that tie on Verify rate. <b>Judge score</b> rates process/quality on top of an already-known verify result; it does not re-derive correctness.</p>`,
  ];
  if (data.summaries.some((s) => s.reviewRuns > 0)) {
    metricNotesParts.push(
      `<p class="muted">Code-review metrics: <b>recall</b> is severity-weighted (high=3/med=2/low=1); <b>precision</b> is unweighted claim-count (TP / (TP + plausible extras)). F1 mixes those scales. Passed/Failed apply only to fixture/external verify, not code-review cells.</p>`,
    );
  }
  const metricNotes = metricNotesParts.join("\n");

  return `
  <h2>SWE Task Summary</h2>
  ${metricNotes}
  <table class="summary-table">
    <thead>
      <tr>
        <th>Harness:Model</th>
        <th>Total</th>
        <th>OK</th>
        <th>Errors</th>
        <th>Verify passed</th>
        <th>Verify failed</th>
        <th>Verify rate</th>
        <th>Clean passed</th>
        <th>Verified after timeout</th>
        <th>Clean pass rate</th>
        <th>Avg test pass %</th>
        <th>Avg judge score</th>
        <th>Median judge score</th>
        <th>Avg recall</th>
        <th>Avg precision</th>
        <th>Avg F1</th>
        <th>Avg agent ms</th>
        <th>Decode tok/s</th>
        <th>Prompt tok/s</th>
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
