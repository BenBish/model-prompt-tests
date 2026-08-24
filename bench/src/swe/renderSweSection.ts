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
          <td>${summary.intentionToEvaluateRuns}</td>
          <td>${formatPercent(summary.passAt1)}</td>
          <td>${formatPercent(summary.repeatedTrialSolveRate)}</td>
          <td>${summary.repeatsObserved}</td>
          <td>${summary.infrastructureFailures}</td>
          <td>${summary.publicationBlockedRuns}</td>
          <td>${summary.okRuns}</td>
          <td>${summary.errorRuns}</td>
          <td>${summary.passedRuns}</td>
          <td>${summary.failedRuns}</td>
          <td>${formatPercent(summary.intentionToEvaluatePassRate)}</td>
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
  if (data.summaries.length === 0) return "";

  const header =
    "| Harness:Model | Scheduled | ITT trials | Pass@1 | Repeated solve | Repeats | Infra failures | Publication blocked | OK | Errors | Verify passed | Verify failed | ITT pass rate | Clean passed | Verified after timeout | Clean pass rate | Task-weighted test pass % | Secondary avg judge | Secondary median judge | Avg recall | Avg precision | Avg F1 | Avg agent ms | Decode tok/s | Prompt tok/s | Avg diff lines | Timeouts |\n" +
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |";
  const rows = data.summaries.map(
    (summary) =>
      `| \`${summary.harnessModelId}\` | ${summary.totalRuns} | ${summary.intentionToEvaluateRuns} | ${formatPercent(summary.passAt1)} | ${formatPercent(summary.repeatedTrialSolveRate)} | ${summary.repeatsObserved} | ${summary.infrastructureFailures} | ${summary.publicationBlockedRuns} | ${summary.okRuns} | ${summary.errorRuns} | ` +
      `${summary.passedRuns} | ${summary.failedRuns} | ${formatPercent(summary.intentionToEvaluatePassRate)} | ` +
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
  if (data.statisticalAnalysis.comparisons.length > 0) {
    const comparisonRows = data.statisticalAnalysis.comparisons.map((c) =>
      `| \`${c.baselineId}\` → \`${c.candidateId}\` | ${c.baselineId.split(":")[0] === c.candidateId.split(":")[0] ? "pure-model" : "full-agent-system"} | ${c.matchedTasks}/${c.unionTasks} | ${formatPercent(c.coverage)} | ${formatPercent(c.delta)} (${formatPercent(c.interval.low)} to ${formatPercent(c.interval.high)}) | ${c.wins}/${c.losses}/${c.ties} | **${c.verdict}** |`,
    );
    sections.push(`### Paired uncertainty and verdicts\n\n| Baseline → candidate | Claim type | Matched/union tasks | Coverage | Paired delta (95% hierarchical bootstrap CI) | W/L/T | Verdict |\n| --- | --- | ---: | ---: | ---: | ---: | --- |\n${comparisonRows.join("\n")}\n\nRank stability: ${data.statisticalAnalysis.rankStability.topModelId ? `\`${data.statisticalAnalysis.rankStability.topModelId}\` is top in ${formatPercent(data.statisticalAnalysis.rankStability.topRankProbability)} of bootstrap samples` : "unavailable"}.\n\n${data.statisticalAnalysis.warnings.length ? data.statisticalAnalysis.warnings.map((warning) => `- Warning: ${warning}`).join("\n") : "No statistical warnings."}`);
  }
  if (data.harnessComparisons.length > 0) {
    const comparisonRows = data.harnessComparisons.flatMap((comparison) => comparison.metrics.map((metric) =>
      `| \`${comparison.baselineId}\` → \`${comparison.candidateId}\` | ${comparison.kind} | ${metric.metric} | ${metric.matchedTasks} | ${metric.delta === undefined ? "—" : formatNumber(metric.delta, 3)} | ${metric.interval ? `${formatNumber(metric.interval.low, 3)} to ${formatNumber(metric.interval.high, 3)}` : "—"} | ${comparison.excluded ? `excluded: ${comparison.reasons.join("; ")}` : "eligible"} |`,
    ));
    sections.push(`### Controlled cross-harness comparisons\n\nGrouped by immutable underlying model and matched task. Positive deltas mean the agent-loop harness is higher than raw API; latency, cost, and diff-size deltas are therefore not inherently improvements.\n\n| Raw API → agent loop | Claim type | Metric | Matched tasks | Delta | 95% hierarchical bootstrap CI | Harness-uplift status |\n| --- | --- | --- | ---: | ---: | --- | --- |\n${comparisonRows.join("\n")}`);
  }
  sections.push(
    [
      "### Metric notes",
      "",
      "- **ITT pass rate** includes every scheduled candidate trial (candidate failure, invalid output, and timeout); harness/verifier/judge infrastructure failures are separated.",
      "- **Pass@1** is the task-weighted result of the first scheduled trial. **Repeated solve** is the observed task-weighted fraction solved at least once across repeats; it is not the independent-sampling estimator `1-(1-p)^k` because repeated agent trials may be correlated.",
      "- **Task-weighted test pass %** averages each run's structured verifier fraction without pooling subtests, so test-heavy tasks cannot dominate. Bun, TAP, JUnit, JSON, and pytest are supported; exit-code-only tasks remain binary.",
      "- **Avg/median judge** is a secondary process/code-quality signal and never overrides objective correctness.",
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
  if (data.summaries.length === 0) return "";

  const headerCells = data.harnessModelIds.map((id) => `<th>${escapeHtml(id)}</th>`).join("");
  const bodyRows = data.taskIds
    .map((taskId) => {
      const byModel = data.rows.get(taskId)!;
      const cells = data.harnessModelIds.map((id) => renderSweCell(byModel.get(id))).join("");
      return `<tr><th class="prompt-id">${escapeHtml(taskId)}</th>${cells}</tr>`;
    })
    .join("");

  const metricNotesParts = [
    `<p class="muted"><b>Objective correctness is primary.</b> ITT pass rate keeps candidate failures, invalid output, and timeouts in the denominator. Pass@1 is task-weighted first-trial correctness; repeated solve is the observed fraction of tasks solved at least once (repeats are not assumed independent). Infrastructure failures and quarantined evidence are separate. Structured partial credit supports Bun, TAP, JUnit, JSON, and pytest without pooling subtests across tasks. <b>Judge scores are secondary</b> quality signals.</p>`,
  ];
  if (data.summaries.some((s) => s.reviewRuns > 0)) {
    metricNotesParts.push(
      `<p class="muted">Code-review metrics: <b>recall</b> is severity-weighted (high=3/med=2/low=1); <b>precision</b> is unweighted claim-count (TP / (TP + plausible extras)). F1 mixes those scales. Passed/Failed apply only to fixture/external verify, not code-review cells.</p>`,
    );
  }
  const metricNotes = metricNotesParts.join("\n");
  const statisticalHtml = data.statisticalAnalysis.comparisons.length ? `<h3>Paired uncertainty and verdicts</h3>
    <p class="muted">Matched-task correctness deltas use a hierarchical bootstrap across tasks and repeats. A win/loss requires minimum coverage/sample gates and the full 95% interval beyond the practical-equivalence threshold (${formatPercent(data.statisticalAnalysis.config.practicalEquivalence)}).</p>
    <table class="summary-table"><thead><tr><th>Baseline → candidate</th><th>Claim type</th><th>Matched/union</th><th>Coverage</th><th>Delta (95% CI)</th><th>W/L/T</th><th>Verdict</th></tr></thead><tbody>${data.statisticalAnalysis.comparisons.map((c) => `<tr><th>${escapeHtml(c.baselineId)} → ${escapeHtml(c.candidateId)}</th><td>${c.baselineId.split(":")[0] === c.candidateId.split(":")[0] ? "pure-model" : "full-agent-system"}</td><td>${c.matchedTasks}/${c.unionTasks}</td><td>${formatPercent(c.coverage)}</td><td>${formatPercent(c.delta)} (${formatPercent(c.interval.low)} to ${formatPercent(c.interval.high)})</td><td>${c.wins}/${c.losses}/${c.ties}</td><td><b>${c.verdict}</b></td></tr>`).join("")}</tbody></table>
    <p class="muted">Rank stability: ${data.statisticalAnalysis.rankStability.topModelId ? `${escapeHtml(data.statisticalAnalysis.rankStability.topModelId)} top in ${formatPercent(data.statisticalAnalysis.rankStability.topRankProbability)} of bootstrap samples.` : "unavailable."} ${data.statisticalAnalysis.warnings.map((warning) => `Warning: ${escapeHtml(warning)}.`).join(" ")}</p>` : "";
  const harnessHtml = data.harnessComparisons.length ? `<h3>Controlled cross-harness comparisons</h3><p class="muted">Grouped by immutable underlying model and matched task. Positive deltas mean agent loop minus raw API.</p><table class="summary-table"><thead><tr><th>Raw API → agent loop</th><th>Claim type</th><th>Metric</th><th>Matched tasks</th><th>Delta (95% CI)</th><th>Status</th></tr></thead><tbody>${data.harnessComparisons.flatMap((comparison) => comparison.metrics.map((metric) => `<tr><th>${escapeHtml(comparison.baselineId)} → ${escapeHtml(comparison.candidateId)}</th><td>${escapeHtml(comparison.kind)}</td><td>${escapeHtml(metric.metric)}</td><td>${metric.matchedTasks}</td><td>${metric.delta === undefined ? "—" : `${formatNumber(metric.delta, 3)} (${formatNumber(metric.interval?.low, 3)} to ${formatNumber(metric.interval?.high, 3)})`}</td><td>${comparison.excluded ? `Excluded: ${escapeHtml(comparison.reasons.join("; "))}` : "Eligible for harness-effect interpretation"}</td></tr>`)).join("")}</tbody></table>` : "";

  return `
  <h2>SWE Task Summary</h2>
  ${metricNotes}
  ${statisticalHtml}
  ${harnessHtml}
  <table class="summary-table">
    <thead>
      <tr>
        <th>Harness:Model</th>
        <th>Total</th>
        <th>ITT trials</th>
        <th>Pass@1</th>
        <th>Repeated solve</th>
        <th>Repeats</th>
        <th>Infra failures</th>
        <th>Publication blocked</th>
        <th>OK</th>
        <th>Errors</th>
        <th>Verify passed</th>
        <th>Verify failed</th>
        <th>ITT pass rate</th>
        <th>Clean passed</th>
        <th>Verified after timeout</th>
        <th>Clean pass rate</th>
        <th>Avg test pass % (task-weighted)</th>
        <th>Secondary avg judge</th>
        <th>Secondary median judge</th>
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
    <tbody>${bodyRows || `<tr><td colspan="${data.harnessModelIds.length + 1}">No comparable task details; evidence is quarantined or publication-blocking.</td></tr>`}</tbody>
  </table>
  `;
}
