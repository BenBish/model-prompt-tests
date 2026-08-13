import { escapeHtml } from "../util/html";
import type { SynthesisReportData, SynthesisGroupView } from "./reportData";

function groupTitle(group: SynthesisGroupView): string {
  return group.repeatIndex > 0 ? `${group.promptId} (repeat ${group.repeatIndex})` : group.promptId;
}

export function renderSynthesisHtmlSection(data: SynthesisReportData): string {
  if (data.groups.length === 0) return "";

  const costFragment =
    data.totalCostUsd !== undefined
      ? ` Chairman call cost (tracked separately): $${data.totalCostUsd.toFixed(4)}.`
      : "";

  const blocks = data.groups
    .map((group) => {
      const prov = group.provenance;
      const sources = (prov?.candidateModelIds ?? []).map((id) => `<code>${escapeHtml(id)}</code>`).join(", ");
      const used = (prov?.usedModelIds ?? []).map((id) => `<code>${escapeHtml(id)}</code>`).join(", ");
      const ranks =
        prov?.peerRankOrder && prov.peerRankOrder.length > 0
          ? `<p>Peer rank hint: ${prov.peerRankOrder.map((id) => `<code>${escapeHtml(id)}</code>`).join(" → ")}</p>`
          : "";
      const body =
        group.status === "ok"
          ? `<div class="synthesis-answer">${escapeHtml(group.synthesisText ?? "")}</div>` +
            (prov?.notes ? `<p class="synthesis-notes">${escapeHtml(prov.notes)}</p>` : "")
          : `<p class="synthesis-error">${escapeHtml(group.error ?? "unknown error")}</p>`;

      return `
    <details class="synthesis-group"${group.status === "ok" ? " open" : ""}>
      <summary><code>${escapeHtml(groupTitle(group))}</code> — chairman <code>${escapeHtml(group.chairmanModelId)}</code> (${group.status})</summary>
      <p>Candidates: ${sources || "—"}. Cited: ${used || "—"}.</p>
      ${ranks}
      ${body}
    </details>`;
    })
    .join("");

  return `
    <section class="synthesis-section">
      <h2>Chairman synthesis (answer production)</h2>
      <p>
        Optional council Stage 3: one chairman model combines candidate answers into a single
        response. This is <strong>not</strong> a leaderboard score and does
        <strong>not</strong> change rubric <code>avgScore</code>.
      </p>
      <p>${data.totalOk} ok synthesis call(s), ${data.totalError} error(s).${costFragment}</p>
      ${blocks}
    </section>`;
}

export function renderSynthesisAssessmentSection(data: SynthesisReportData): string {
  if (data.groups.length === 0) return "";

  const lines: string[] = [];
  lines.push("## Chairman synthesis (answer production)");
  lines.push("");
  lines.push(
    "Optional council Stage 3. Does **not** replace or blend into rubric avgScore headlines.",
  );
  lines.push("");
  lines.push(
    `Synthesis calls: ${data.totalOk} ok, ${data.totalError} error` +
      (data.totalCostUsd !== undefined ? `, cost $${data.totalCostUsd.toFixed(4)}` : "") +
      ".",
  );
  lines.push("");

  for (const group of data.groups) {
    const title = groupTitle(group);
    lines.push(`### \`${title}\``);
    lines.push("");
    lines.push(`Chairman: \`${group.chairmanModelId}\` (${group.status})`);
    const prov = group.provenance;
    if (prov) {
      lines.push(
        `Candidates: ${prov.candidateModelIds.map((id) => `\`${id}\``).join(", ") || "—"}. ` +
          `Cited: ${prov.usedModelIds.map((id) => `\`${id}\``).join(", ") || "—"}.`,
      );
      if (prov.peerRankOrder && prov.peerRankOrder.length > 0) {
        lines.push(`Peer rank hint: ${prov.peerRankOrder.map((id) => `\`${id}\``).join(" → ")}`);
      }
    }
    lines.push("");
    if (group.status === "ok") {
      lines.push(group.synthesisText ?? "");
      if (prov?.notes) {
        lines.push("");
        lines.push(`_Provenance notes:_ ${prov.notes}`);
      }
    } else {
      lines.push(`Error: ${group.error ?? "unknown"}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
