import { mkdirSync } from "node:fs";
import type { Database } from "bun:sqlite";
import type { BenchModelsConfig } from "../config/modelConfig";
import { findModel } from "../config/modelConfig";
import { queryReportData, type ModelSummary, type ReportData, type ReportRow } from "../report/queryData";
import { renderReportHtml } from "../report/renderHtml";

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function validateExportName(name: string): void {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(`export name "${name}" must be lowercase letters, digits, and hyphens only (e.g. "grok-45-vs-sonnet-5")`);
  }
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((word) => (word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function fmt(value: number | undefined, digits = 2): string {
  return value === undefined ? "—" : value.toFixed(digits);
}

function usd(value: number | undefined): string {
  return value === undefined ? "—" : `$${value.toFixed(4)}`;
}

interface RawJudgeScore {
  judge_model_id: string;
  status: "ok" | "error";
  score: number | null;
  rationale: string | null;
  error: string | null;
}

interface RawExportRow {
  run_batch_id: string;
  prompt_id: string;
  model_id: string;
  model_name: string;
  provider_id: string;
  started_at: string;
  status: "ok" | "error";
  attempt: number;
  latency_ms?: number;
  input_tokens?: number;
  output_tokens?: number;
  output_text?: string;
  error?: string;
  stop_reason?: string;
  cost_usd?: number;
  judge_scores: RawJudgeScore[];
}

function toRawRow(row: ReportRow): RawExportRow {
  return {
    run_batch_id: row.runBatchId,
    prompt_id: row.promptId,
    model_id: row.modelId,
    model_name: row.modelName,
    provider_id: row.providerId,
    started_at: row.startedAt,
    status: row.runStatus,
    attempt: row.attempt,
    latency_ms: row.latencyMs,
    input_tokens: row.inputTokens,
    output_tokens: row.outputTokens,
    output_text: row.outputText,
    error: row.error,
    stop_reason: row.stopReason,
    cost_usd: row.costUsd,
    judge_scores: row.judgeResults.map((judge) => ({
      judge_model_id: judge.judgeModelId,
      status: judge.judgeStatus,
      score: judge.score ?? null,
      rationale: judge.rationale ?? null,
      error: judge.judgeError ?? null,
    })),
  };
}

function buildRawExportRows(data: ReportData): RawExportRow[] {
  const rows: RawExportRow[] = [];
  for (const promptId of data.promptIds) {
    const byModel = data.rows.get(promptId)!;
    for (const modelId of data.modelIds) {
      for (const row of byModel.get(modelId) ?? []) {
        rows.push(toRawRow(row));
      }
    }
  }
  return rows;
}

function collectJudgeModelIds(data: ReportData): string[] {
  const ids = new Set<string>();
  for (const byModel of data.rows.values()) {
    for (const rows of byModel.values()) {
      for (const row of rows) {
        for (const judge of row.judgeResults) ids.add(judge.judgeModelId);
      }
    }
  }
  return [...ids].sort();
}

function collectJudgeFailures(data: ReportData): string[] {
  const failures: string[] = [];
  for (const promptId of data.promptIds) {
    const byModel = data.rows.get(promptId)!;
    for (const modelId of data.modelIds) {
      for (const row of byModel.get(modelId) ?? []) {
        for (const judge of row.judgeResults) {
          if (judge.judgeStatus === "error") {
            failures.push(`\`${promptId}\` x \`${modelId}\` judged by \`${judge.judgeModelId}\`: ${judge.judgeError ?? "unknown error"}`);
          }
        }
      }
    }
  }
  return failures;
}

function buildPerPromptResultsMd(data: ReportData): string {
  const header = `| Prompt | ${data.modelIds.map((id) => `\`${id}\` score`).join(" | ")} | Notes (fill in) |`;
  const divider = `| --- | ${data.modelIds.map(() => "---:").join(" | ")} | --- |`;
  const rows = data.promptIds.map((promptId) => {
    const cells = data.modelIds.map((modelId) => {
      const summary = data.promptSummaries.find((p) => p.promptId === promptId && p.modelId === modelId);
      return fmt(summary?.avgScore);
    });
    return `| \`${promptId}\` | ${cells.join(" | ")} |  |`;
  });

  const aggregateHeader =
    "| Model | OK | Errors | Score (peer) | Score (self) | Score σ | Avg latency ms | Avg output tokens | Avg judge spread | Quality/sec | Total cost | Quality/$ | Truncated |";
  const aggregateDivider = "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |";
  const aggregateRows = data.summaries.map(
    (s: ModelSummary) =>
      `| \`${s.modelId}\` | ${s.okRuns} | ${s.errorRuns} | ${fmt(s.avgScore)} | ${fmt(s.selfScoreAvg)} | ${fmt(s.scoreStdDev)} | ${fmt(s.avgLatencyMs, 0)} | ${fmt(s.avgOutputTokens, 0)} | ${fmt(s.avgJudgeSpread)} | ${fmt(s.qualityPerSecond, 3)} | ${usd(s.totalCostUsd)} | ${fmt(s.qualityPerDollar, 1)} | ${s.truncatedRuns} |`,
  );

  const failures = collectJudgeFailures(data);
  const failuresSection =
    failures.length > 0
      ? `\n## Judge Failure Rows\n\n${failures.map((f) => `- ${f}`).join("\n")}\n`
      : "\n## Judge Failure Rows\n\nNone -- every judge call returned a valid score.\n";

  return `# Per-Prompt Results

Average scores are calculated from successful peer-judge rows (self-judging excluded) for each candidate response.

${header}
${divider}
${rows.join("\n")}

## Aggregate Metrics

${aggregateHeader}
${aggregateDivider}
${aggregateRows.join("\n")}
${failuresSection}`;
}

function buildRunConfigMd(name: string, runBatchId: string, generatedAt: string, data: ReportData, config: BenchModelsConfig): string {
  const totalOk = data.summaries.reduce((sum, s) => sum + s.okRuns, 0);
  const totalErr = data.summaries.reduce((sum, s) => sum + s.errorRuns, 0);
  const judgeFailureCount = collectJudgeFailures(data).length;
  const judgeModelIds = collectJudgeModelIds(data);

  const candidateLines = data.modelIds.map((modelId) => {
    const entry = findModel(config, modelId);
    if (!entry) return `  - \`${modelId}\` (not found in current models config)`;
    const details = [
      entry.kind === "anthropic" ? "anthropic" : entry.providerId,
      entry.modelName,
      entry.kind === "openai-compatible" && entry.reasoningEffort ? `reasoningEffort: ${entry.reasoningEffort}` : undefined,
      entry.maxConcurrent !== undefined ? `maxConcurrent: ${entry.maxConcurrent}` : undefined,
      entry.timeoutMs !== undefined ? `timeoutMs: ${entry.timeoutMs}` : undefined,
    ]
      .filter(Boolean)
      .join(", ");
    return `  - \`${modelId}\` (${details})`;
  });

  return `# ${titleCase(name)} Run Config

- Run batch: \`${runBatchId}\`
- Report generated: \`${generatedAt}\`
- Prompt set: ${data.promptIds.length} prompt(s) (see \`per-prompt-results.md\` for the list)
- Runner: \`bun run bench run all\`
- Candidate models:
${candidateLines.join("\n")}
- Judge models:
${judgeModelIds.map((id) => `  - \`${id}\``).join("\n")}
- Success rate: ${totalOk} of ${totalOk + totalErr} candidate responses completed
- Judge failures: ${judgeFailureCount} (see \`per-prompt-results.md\` for details)
- Score handling: headline scores use successful peer-judge rows only (self-judging is excluded and reported separately)

The tracked evidence files for this run are:

- \`summary.json\`: aggregate model score, cost, latency, token, judge-spread, and quality-per-second/dollar metrics.
- \`per-prompt-results.md\`: per-prompt average scores and aggregate metrics.
- \`raw-outputs-and-scores.json\`: candidate outputs and judge score/rationale rows exported from \`bench/data/bench.sqlite\`.
- \`report.html\`: the full interactive report for this batch.
- \`data.json\`: compact summary payload used by \`bench publish\`.
`;
}

function buildArticleSkeleton(name: string, data: ReportData): string {
  const scored = data.summaries.filter((s) => s.avgScore !== undefined);
  const ranked = [...scored].sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));
  const winner = ranked[0];
  const headlineTable = [
    "| Model | Score (peer) | Avg latency ms | Total cost | Quality/$ |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...ranked.map((s) => `| \`${s.modelId}\` | ${fmt(s.avgScore)} | ${fmt(s.avgLatencyMs, 0)} | ${usd(s.totalCostUsd)} | ${fmt(s.qualityPerDollar, 1)} |`),
  ].join("\n");

  return `# ${titleCase(name)}

_TODO: one-sentence hook -- what's the headline finding?_

## Methodology

- ${data.promptIds.length} prompt tests from this repository's prompt library, covering a range of coding, writing, planning, and judgment tasks.
- Candidate models: ${data.modelIds.map((id) => `\`${id}\``).join(", ")}.
- Judge models: ${collectJudgeModelIds(data).map((id) => `\`${id}\``).join(", ")}.
- Full config in \`run-config.md\`; raw outputs and judge rationales in \`raw-outputs-and-scores.json\`.

## Headline Results

${headlineTable}

${winner ? `\`${winner.modelId}\` led on peer-judged score in this run.` : ""}

## Where each model looked strong

_TODO: per-model highlights, with specific prompt examples._

## Failure modes

_TODO: notable weaknesses, truncation, or judge disagreement worth calling out._

## Practical takeaways

_TODO._

## Limitations

- This is one benchmark run, not a universal ranking. Latency and cost are harness-measured for this run only.
- Self-judging is excluded from headline scores; see \`summary.json\` for the self-judged numbers.

## Next steps

_TODO._
`;
}

function buildXThreadSkeleton(name: string, data: ReportData): string {
  const scored = data.summaries.filter((s) => s.avgScore !== undefined);
  const ranked = [...scored].sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));
  const winner = ranked[0];
  const runnerUp = ranked[1];

  return `# X Thread Draft

1. _TODO: hook._ I ran ${data.modelIds.length} models across ${data.promptIds.length} practical prompt tests for "${titleCase(name)}".

${
  winner && runnerUp
    ? `${winner.modelId} led with a ${fmt(winner.avgScore)} avg score vs ${runnerUp.modelId}'s ${fmt(runnerUp.avgScore)}.`
    : "_TODO: headline score comparison._"
}

2. The caveat: this is not a universal model ranking. One repo-local benchmark run with multi-judge LLM scoring. Raw outputs, config, and rationales are in the repo.

3. _TODO: where the winner looked strongest._

4. _TODO: where models struggled._

5. _TODO: practical takeaway._

6. Full write-up: _TODO: link_
`;
}

export interface SitePayload {
  name: string;
  runBatchId: string;
  generatedAt: string;
  promptCount: number;
  modelIds: string[];
  summaries: ModelSummary[];
}

export interface ExportBatchOptions {
  db: Database;
  config: BenchModelsConfig;
  runBatchId: string;
  name: string;
  outDir: string;
  generatedAt?: string;
}

export interface ExportBatchResult {
  outDir: string;
  files: string[];
  data: ReportData;
}

export async function exportBatch(options: ExportBatchOptions): Promise<ExportBatchResult> {
  validateExportName(options.name);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const data = queryReportData(options.db, { runBatchId: options.runBatchId, allRuns: true });
  if (data.promptIds.length === 0) {
    throw new Error(`no runs found for batch "${options.runBatchId}"`);
  }

  mkdirSync(options.outDir, { recursive: true });

  const rawRows = buildRawExportRows(data);
  const sitePayload: SitePayload = {
    name: options.name,
    runBatchId: options.runBatchId,
    generatedAt,
    promptCount: data.promptIds.length,
    modelIds: data.modelIds,
    summaries: data.summaries,
  };

  const files: { path: string; content: string }[] = [
    { path: "summary.json", content: `${JSON.stringify(data.summaries, null, 2)}\n` },
    { path: "raw-outputs-and-scores.json", content: `${JSON.stringify(rawRows, null, 2)}\n` },
    { path: "per-prompt-results.md", content: buildPerPromptResultsMd(data) },
    { path: "run-config.md", content: buildRunConfigMd(options.name, options.runBatchId, generatedAt, data, options.config) },
    { path: "report.html", content: renderReportHtml(data, generatedAt) },
    { path: "data.json", content: `${JSON.stringify(sitePayload, null, 2)}\n` },
    { path: "article.md", content: buildArticleSkeleton(options.name, data) },
    { path: "x-thread.md", content: buildXThreadSkeleton(options.name, data) },
  ];

  for (const file of files) {
    await Bun.write(`${options.outDir}/${file.path}`, file.content);
  }

  return { outDir: options.outDir, files: files.map((f) => f.path), data };
}
