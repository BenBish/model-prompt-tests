import type { ToolProbeCandidateSummary } from "./runToolProbe";

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** Renders a markdown summary table for `bun bench hermes tools` console output. */
export function renderToolProbeSection(summaries: ToolProbeCandidateSummary[]): string {
  if (summaries.length === 0) return "";

  const header =
    "| Model | Cases | Errors | Well-formed | Correct tool | Valid args | Avg latency ms |\n" +
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |";
  const rows = summaries.map(
    (s) =>
      `| \`${s.modelId}\` | ${s.cases} | ${s.errors} | ${pct(s.wellFormedRate)} | ${pct(s.correctToolRate)} | ` +
      `${pct(s.validArgsRate)} | ${s.avgLatencyMs !== undefined ? Math.round(s.avgLatencyMs) : "—"} |`,
  );

  return ["## Hermes Tool Probe", "", header, ...rows].join("\n");
}
