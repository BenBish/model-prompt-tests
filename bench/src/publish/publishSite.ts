import { mkdirSync } from "node:fs";
import { escapeHtml } from "../util/html";
import type { SitePayload } from "../export/exportBatch";
import type { ModelSummary } from "../report/queryData";
import { paletteStyleBlock, reportBaseStyles } from "../report/charts";

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((word) => (word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function topScore(summaries: ModelSummary[]): { modelId: string; avgScore: number } | undefined {
  const scored = summaries.filter((s): s is ModelSummary & { avgScore: number } => s.avgScore !== undefined);
  if (scored.length === 0) return undefined;
  return scored.reduce((best, s) => (s.avgScore > best.avgScore ? s : best));
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 10);
}

function injectMetaTags(html: string, title: string, description: string): string {
  const tags = [
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
  ].join("\n");
  if (html.includes("</title>")) {
    return html.replace("</title>", `</title>\n${tags}`);
  }
  return html.replace("</head>", `${tags}\n</head>`);
}

function runDescription(payload: SitePayload): string {
  const best = topScore(payload.summaries);
  const parts = [
    `${payload.modelIds.length} model(s) across ${payload.promptCount} prompt(s)`,
    best ? `top score ${best.avgScore.toFixed(2)} (${best.modelId})` : undefined,
  ].filter(Boolean);
  return parts.join(" · ");
}

function renderRunCard(payload: SitePayload): string {
  const best = topScore(payload.summaries);
  return `
    <a class="run-card" href="runs/${escapeHtml(payload.name)}/index.html">
      <h3>${escapeHtml(titleCase(payload.name))}</h3>
      <div class="run-date">${escapeHtml(formatDate(payload.generatedAt))} · ${payload.promptCount} prompts · ${payload.modelIds.length} models</div>
      <div class="run-models">${escapeHtml(payload.modelIds.join(", "))}</div>
      ${
        best
          ? `<div class="run-winner"><b>${best.avgScore.toFixed(2)}</b> top score &mdash; ${escapeHtml(best.modelId)}</div>`
          : ""
      }
    </a>
  `;
}

function renderIndexHtml(payloads: SitePayload[], generatedAt: string): string {
  const cards = payloads.map(renderRunCard).join("");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>model-prompt-tests benchmarks</title>
<meta name="description" content="Published AI model benchmark runs from model-prompt-tests.">
<style>
${reportBaseStyles()}
${paletteStyleBlock()}
</style>
</head>
<body>
  <div class="page viz-root">
    <header class="report-header">
      <div>
        <h1>model-prompt-tests benchmarks</h1>
        <p class="generated-at">Updated ${escapeHtml(generatedAt)}</p>
      </div>
    </header>
    <p class="site-intro">Model-vs-model benchmark runs: prompt-level LLM-judged scores, cost, latency, and full raw outputs. Each run below is independently reproducible from the config and prompt set committed alongside it.</p>
    ${payloads.length === 0 ? `<p class="chart-empty">No published runs yet -- run <code>bench export</code> then <code>bench publish</code>.</p>` : `<div class="run-grid">${cards}</div>`}
  </div>
</body>
</html>`;
}

export interface PublishOptions {
  resultsDir: string;
  outDir: string;
  generatedAt?: string;
}

export interface PublishResult {
  outDir: string;
  published: string[];
  skipped: { name: string; reason: string }[];
}

export async function publishSite(options: PublishOptions): Promise<PublishResult> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const glob = new Bun.Glob("*/data.json");
  const payloads: SitePayload[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for await (const relPath of glob.scan({ cwd: options.resultsDir })) {
    const dir = relPath.replace(/\/data\.json$/, "");
    const dataPath = `${options.resultsDir}/${relPath}`;
    const reportPath = `${options.resultsDir}/${dir}/report.html`;

    let payload: SitePayload;
    try {
      payload = JSON.parse(await Bun.file(dataPath).text());
    } catch (err) {
      skipped.push({ name: dir, reason: `invalid data.json: ${err instanceof Error ? err.message : String(err)}` });
      continue;
    }
    if (!(await Bun.file(reportPath).exists())) {
      skipped.push({ name: dir, reason: "missing report.html (run `bench export` for this batch first)" });
      continue;
    }
    payloads.push(payload);
  }

  payloads.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));

  mkdirSync(options.outDir, { recursive: true });
  mkdirSync(`${options.outDir}/runs`, { recursive: true });

  for (const payload of payloads) {
    const reportPath = `${options.resultsDir}/${payload.name}/report.html`;
    const html = await Bun.file(reportPath).text();
    const tagged = injectMetaTags(html, `${titleCase(payload.name)} — model-prompt-tests bench`, runDescription(payload));
    const runOutDir = `${options.outDir}/runs/${payload.name}`;
    mkdirSync(runOutDir, { recursive: true });
    await Bun.write(`${runOutDir}/index.html`, tagged);
  }

  await Bun.write(`${options.outDir}/index.html`, renderIndexHtml(payloads, generatedAt));

  return { outDir: options.outDir, published: payloads.map((p) => p.name), skipped };
}
