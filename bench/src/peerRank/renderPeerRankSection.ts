import { escapeHtml } from "../util/html";
import type { PeerRankReportData } from "./reportData";

export function renderPeerRankHtmlSection(data: PeerRankReportData): string {
  if (data.groups.length === 0) return "";

  const overallRows = data.overall
    .map(
      (row, index) =>
        `<tr><td>${index + 1}</td><td><code>${escapeHtml(row.modelId)}</code></td>` +
        `<td>${row.bordaScore}</td><td>${row.averageRank.toFixed(2)}</td>` +
        `<td>${row.timesRanked}</td></tr>`,
    )
    .join("");

  const groupBlocks = data.groups
    .map((group) => {
      const title =
        group.repeatIndex > 0
          ? `${group.promptId} (repeat ${group.repeatIndex})`
          : group.promptId;
      const orderRows = group.aggregate
        .map(
          (row, index) =>
            `<tr><td>${index + 1}</td><td><code>${escapeHtml(row.modelId)}</code></td>` +
            `<td>${row.bordaScore}</td><td>${row.averageRank.toFixed(2)}</td></tr>`,
        )
        .join("");
      const perRanker = group.rankings
        .map(
          (r) =>
            `<li><code>${escapeHtml(r.rankerModelId)}</code>: ` +
            `${r.modelOrder.map((m) => `<code>${escapeHtml(m)}</code>`).join(" → ")}` +
            (r.rationale
              ? `<br><span class="peer-rank-rationale">${escapeHtml(r.rationale)}</span>`
              : "") +
            `</li>`,
        )
        .join("");
      const errors =
        group.errors.length === 0
          ? ""
          : `<p class="peer-rank-errors">Errors: ${group.errors
              .map((e) => `${escapeHtml(e.rankerModelId)}: ${escapeHtml(e.error)}`)
              .join("; ")}</p>`;

      return `
    <details class="peer-rank-group">
      <summary><code>${escapeHtml(title)}</code> — aggregate order</summary>
      <table class="peer-rank-table">
        <thead><tr><th>#</th><th>Model</th><th>Borda</th><th>Avg rank</th></tr></thead>
        <tbody>${orderRows || '<tr><td colspan="4">No successful rankings</td></tr>'}</tbody>
      </table>
      <h4>Per-ranker (deanonymized, best → worst)</h4>
      <ul>${perRanker || "<li>None</li>"}</ul>
      ${errors}
    </details>`;
    })
    .join("\n");

  const costLine =
    data.totalCostUsd !== undefined
      ? `<p>Ranking call cost (tracked): $${data.totalCostUsd.toFixed(4)}</p>`
      : "";

  return `
    <section class="peer-rank-section">
      <h2>Peer ranking (secondary signal)</h2>
      <p>
        Anonymized multi-model rankings (council Stage 2). Labels were shuffled per ranker call;
        tables below are deanonymized. This does <strong>not</strong> replace rubric
        <code>avgScore</code> headlines.
      </p>
      <p>${data.totalOk} ok ranking call(s), ${data.totalError} error(s).${costLine ? " " + costLine.replace(/^<p>|<\/p>$/g, "") : ""}</p>
      ${costLine}
      <h3>Overall aggregate (Borda across groups)</h3>
      <table class="peer-rank-table summary-table">
        <thead><tr><th>#</th><th>Model</th><th>Borda</th><th>Avg rank</th><th>Times ranked</th></tr></thead>
        <tbody>${overallRows || '<tr><td colspan="5">No successful rankings</td></tr>'}</tbody>
      </table>
      <h3>Per prompt</h3>
      ${groupBlocks}
    </section>`;
}

export function renderPeerRankAssessmentSection(data: PeerRankReportData): string {
  if (data.groups.length === 0) return "";

  const lines: string[] = [];
  lines.push(`## Peer ranking (secondary signal)`);
  lines.push("");
  lines.push(
    "Anonymized multi-model rankings (council Stage 2). Does **not** replace rubric avgScore headlines.",
  );
  lines.push("");
  lines.push(
    `Ranking calls: ${data.totalOk} ok, ${data.totalError} error` +
      (data.totalCostUsd !== undefined ? `, cost $${data.totalCostUsd.toFixed(4)}` : "") +
      ".",
  );
  lines.push("");
  lines.push(`### Overall aggregate (Borda)`);
  lines.push("");
  lines.push("| # | Model | Borda | Avg rank | Times ranked |");
  lines.push("| ---: | --- | ---: | ---: | ---: |");
  data.overall.forEach((row, index) => {
    lines.push(
      `| ${index + 1} | \`${row.modelId}\` | ${row.bordaScore} | ${row.averageRank.toFixed(2)} | ${row.timesRanked} |`,
    );
  });
  if (data.overall.length === 0) {
    lines.push("| — | — | — | — | — |");
  }
  lines.push("");
  lines.push(`### Per prompt`);
  lines.push("");
  for (const group of data.groups) {
    const title =
      group.repeatIndex > 0
        ? `${group.promptId} (repeat ${group.repeatIndex})`
        : group.promptId;
    lines.push(`#### \`${title}\``);
    lines.push("");
    if (group.aggregate.length > 0) {
      lines.push(
        `Aggregate: ${group.aggregate.map((r) => `\`${r.modelId}\``).join(" → ")}`,
      );
    } else {
      lines.push("Aggregate: (none)");
    }
    for (const r of group.rankings) {
      lines.push(
        `- Ranker \`${r.rankerModelId}\`: ${r.modelOrder.map((m) => `\`${m}\``).join(" → ")}`,
      );
    }
    for (const e of group.errors) {
      lines.push(`- Error \`${e.rankerModelId}\`: ${e.error}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
