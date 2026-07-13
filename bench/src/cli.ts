import { parseArgs } from "node:util";
import { discoverPromptFiles, loadPrompts } from "./parser/discover";
import { parsePromptFile } from "./parser/promptTemplate";
import {
  enabledModelMatrix,
  ensureLocalModelsConfig,
  findModel,
  loadModelsConfig,
  saveLocalModelsConfig,
  type BenchModelsConfig,
} from "./config/modelConfig";
import { createAdapter } from "./providers/registry";
import { candidateRunnerFromAdapter } from "./runner/candidateRunner";
import { runBatch } from "./runner/runBatch";
import { openDb } from "./db/client";
import { queryReportData } from "./report/queryData";
import { renderReportHtml } from "./report/renderHtml";
import type { ModelMatrixEntry } from "./providers/types";

const REPO_ROOT = process.cwd();
const DB_PATH = `${REPO_ROOT}/bench/data/bench.sqlite`;
const REPORTS_DIR = `${REPO_ROOT}/bench/reports`;
const DEFAULT_CONCURRENCY = 3;

function usage(): void {
  console.log(`Usage:
  bun bench/src/cli.ts run <prompt-glob-or-all> [--models id1,id2] [--judge <id>] [--judges id1,id2] [--concurrency <n>] [--dry-run] [--no-judge]
  bun bench/src/cli.ts report [--out <path>] [--batch <run_batch_id>] [--all-runs]
  bun bench/src/cli.ts models <list|init|validate|set-judge|add-openai-compatible|add-anthropic|remove>
  bun bench/src/cli.ts list`);
}

function parsePositiveInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function requireFlag(values: Record<string, unknown>, key: string): string {
  const value = values[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing required --${key}`);
  }
  return value;
}

function parseHeaders(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  const entries = Array.isArray(value) ? value : [value];
  const headers: Record<string, string> = {};
  for (const entry of entries) {
    if (typeof entry !== "string") {
      throw new Error("--header must be provided as Name=Value");
    }
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
      throw new Error(`invalid --header "${entry}"; expected Name=Value`);
    }
    const name = entry.slice(0, separatorIndex).trim();
    const headerValue = entry.slice(separatorIndex + 1).trim();
    if (!name || !headerValue) {
      throw new Error(`invalid --header "${entry}"; expected non-empty Name=Value`);
    }
    if (headers[name] !== undefined) {
      throw new Error(`duplicate --header "${name}"`);
    }
    headers[name] = headerValue;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function resolveMatrix(config: BenchModelsConfig, modelsFlag: string | undefined): ModelMatrixEntry[] {
  const candidateModels = enabledModelMatrix(config);
  if (!modelsFlag) return candidateModels;
  const ids = new Set(modelsFlag.split(",").map((s) => s.trim()));
  const resolved = config.models.filter((entry) => ids.has(entry.id));
  const missing = [...ids].filter((id) => !resolved.some((e) => e.id === id));
  if (missing.length > 0) {
    throw new Error(`unknown model id(s) in --models: ${missing.join(", ")}`);
  }
  return resolved;
}

function resolveJudge(config: BenchModelsConfig, judgeFlag: string | undefined): ModelMatrixEntry {
  const judgeId = judgeFlag ?? process.env.BENCH_JUDGE_MODEL_ID ?? config.judge.modelId;
  const found = findModel(config, judgeId);
  if (!found) {
    throw new Error(`unknown judge model id: ${judgeId}`);
  }
  return found;
}

function resolveJudges(
  config: BenchModelsConfig,
  judgeFlag: string | undefined,
  judgesFlag: string | undefined,
): ModelMatrixEntry[] {
  if (!judgesFlag) return [resolveJudge(config, judgeFlag)];
  if (judgeFlag) {
    throw new Error("use either --judge or --judges, not both");
  }
  const ids = judgesFlag
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) {
    throw new Error("--judges must contain at least one model id");
  }
  return ids.map((id) => {
    const found = findModel(config, id);
    if (!found) {
      throw new Error(`unknown judge model id: ${id}`);
    }
    return found;
  });
}

async function cmdList(): Promise<void> {
  const { config } = await loadModelsConfig(REPO_ROOT);
  const promptFiles = await discoverPromptFiles(REPO_ROOT);
  console.log(`Prompts (${promptFiles.length}):`);
  for (const file of promptFiles) {
    const prompt = await parsePromptFile(file, REPO_ROOT);
    console.log(`  ${prompt.id}`);
  }

  const candidateModels = enabledModelMatrix(config);
  console.log(`\nModel matrix (${candidateModels.length} enabled, ${config.models.length} configured):`);
  for (const entry of config.models) {
    const enabledSuffix = entry.enabled === false ? " [disabled]" : "";
    console.log(
      `  ${entry.id}  (${entry.kind === "anthropic" ? "anthropic" : entry.providerId}: ${entry.modelName})${enabledSuffix}`,
    );
  }

  const judge = resolveJudge(config, undefined);
  console.log(`\nDefault judge: ${judge.id} (${judge.modelName})`);
}

async function cmdRun(positionals: string[], values: Record<string, unknown>): Promise<void> {
  const { config } = await loadModelsConfig(REPO_ROOT);
  const selector = positionals[0];
  if (!selector) {
    usage();
    process.exit(1);
  }

  const prompts = await loadPrompts(REPO_ROOT, selector);
  if (prompts.length === 0) {
    console.error(`No prompts matched selector "${selector}". Try "bun bench/src/cli.ts list".`);
    process.exit(1);
  }

  const matrix = resolveMatrix(config, values.models as string | undefined);
  if (matrix.length === 0) {
    console.error("No models resolved from --models filter.");
    process.exit(1);
  }

  const useJudge = values["no-judge"] !== true;
  const judgeEntries = useJudge
    ? resolveJudges(config, values.judge as string | undefined, values.judges as string | undefined)
    : [];

  if (values["dry-run"]) {
    console.log(`Would run ${prompts.length} prompt(s) x ${matrix.length} model(s):`);
    for (const prompt of prompts) console.log(`  prompt: ${prompt.id}`);
    for (const entry of matrix) console.log(`  model:  ${entry.id}`);
    for (const entry of judgeEntries) console.log(`  judge:  ${entry.id}`);
    console.log("(dry run — no network calls made)");
    return;
  }

  const runners = matrix.map((entry) =>
    candidateRunnerFromAdapter(entry.id, createAdapter(entry), entry.maxConcurrent),
  );

  const db = openDb(DB_PATH);
  const concurrency = values.concurrency ? Number(values.concurrency) : DEFAULT_CONCURRENCY;

  const summary = await runBatch({
    db,
    prompts,
    runners,
    defaultConcurrency: concurrency,
    judges: judgeEntries.map((entry) => ({
      adapter: createAdapter(entry),
      modelId: entry.id,
      maxConcurrent: entry.maxConcurrent,
    })),
  });
  if (summary.errored > 0 || summary.judgeErrored > 0) {
    process.exitCode = 1;
  }
}

async function cmdReport(values: Record<string, unknown>): Promise<void> {
  const db = openDb(DB_PATH);
  const data = queryReportData(db, {
    runBatchId: values.batch as string | undefined,
    allRuns: values["all-runs"] === true,
  });

  const html = renderReportHtml(data, new Date().toISOString());

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = (values.out as string | undefined) ?? `${REPORTS_DIR}/${timestamp}.html`;
  const summaryPath = /\.html?$/i.test(outPath)
    ? outPath.replace(/\.html?$/i, ".summary.json")
    : `${outPath}.summary.json`;
  await Bun.write(outPath, html);
  await Bun.write(summaryPath, `${JSON.stringify(data.summaries, null, 2)}\n`);
  await Bun.write(`${REPORTS_DIR}/latest.html`, html);
  await Bun.write(`${REPORTS_DIR}/latest.summary.json`, `${JSON.stringify(data.summaries, null, 2)}\n`);

  console.log(`Report written to ${outPath}`);
  console.log(`Summary written to ${summaryPath}`);
  console.log(`Also mirrored to ${REPORTS_DIR}/latest.html`);
  console.log(`Also mirrored to ${REPORTS_DIR}/latest.summary.json`);
}

async function cmdModels(rest: string[]): Promise<void> {
  const subcommand = rest[0];
  const args = rest.slice(1);

  switch (subcommand) {
    case "list": {
      const { config, sourcePath, isLocal } = await loadModelsConfig(REPO_ROOT);
      console.log(`Config: ${sourcePath}${isLocal ? "" : " (example fallback)"}`);
      console.log(`\nModels (${config.models.length}):`);
      for (const entry of config.models) {
        const enabled = entry.enabled === false ? "disabled" : "enabled";
        console.log(
          `  ${entry.id}  (${entry.kind === "anthropic" ? "anthropic" : entry.providerId}: ${entry.modelName}, ${enabled})`,
        );
      }
      const judge = resolveJudge(config, undefined);
      console.log(`\nDefault judge: ${judge.id} (${judge.modelName})`);
      break;
    }
    case "init": {
      const path = ensureLocalModelsConfig(REPO_ROOT);
      await loadModelsConfig(REPO_ROOT);
      console.log(`Models config ready at ${path}`);
      break;
    }
    case "validate": {
      const { sourcePath } = await loadModelsConfig(REPO_ROOT);
      console.log(`Models config is valid: ${sourcePath}`);
      break;
    }
    case "set-judge": {
      const modelId = args[0];
      if (!modelId) throw new Error("usage: bun run bench models set-judge <model-id>");
      ensureLocalModelsConfig(REPO_ROOT);
      const { config } = await loadModelsConfig(REPO_ROOT);
      if (!findModel(config, modelId)) {
        throw new Error(`unknown model id: ${modelId}`);
      }
      config.judge.modelId = modelId;
      const path = saveLocalModelsConfig(REPO_ROOT, config);
      console.log(`Default judge set to ${modelId} in ${path}`);
      break;
    }
    case "remove": {
      const modelId = args[0];
      if (!modelId) throw new Error("usage: bun run bench models remove <model-id>");
      ensureLocalModelsConfig(REPO_ROOT);
      const { config } = await loadModelsConfig(REPO_ROOT);
      if (!findModel(config, modelId)) {
        throw new Error(`unknown model id: ${modelId}`);
      }
      if (config.judge.modelId === modelId) {
        throw new Error(`cannot remove "${modelId}" because it is the configured judge`);
      }
      config.models = config.models.filter((model) => model.id !== modelId);
      const path = saveLocalModelsConfig(REPO_ROOT, config);
      console.log(`Removed ${modelId} from ${path}`);
      break;
    }
    case "add-openai-compatible": {
      const { values } = parseArgs({
        args,
        allowPositionals: false,
        options: {
          id: { type: "string" },
          provider: { type: "string" },
          model: { type: "string" },
          "base-url": { type: "string" },
          "api-key-env": { type: "string" },
          header: { type: "string", multiple: true },
          "max-concurrent": { type: "string" },
          "max-tokens": { type: "string" },
          "timeout-ms": { type: "string" },
          "reasoning-effort": { type: "string" },
          disabled: { type: "boolean" },
        },
      });
      ensureLocalModelsConfig(REPO_ROOT);
      const { config } = await loadModelsConfig(REPO_ROOT);
      const id = requireFlag(values, "id");
      if (findModel(config, id)) throw new Error(`model id already exists: ${id}`);
      config.models.push({
        id,
        kind: "openai-compatible",
        providerId: requireFlag(values, "provider"),
        modelName: requireFlag(values, "model"),
        baseUrl: requireFlag(values, "base-url"),
        apiKeyEnvVar: values["api-key-env"] as string | undefined,
        extraHeaders: parseHeaders(values.header),
        reasoningEffort: values["reasoning-effort"] as string | undefined,
        maxConcurrent: parsePositiveInteger(values["max-concurrent"], "--max-concurrent"),
        maxTokens: parsePositiveInteger(values["max-tokens"], "--max-tokens"),
        timeoutMs: parsePositiveInteger(values["timeout-ms"], "--timeout-ms"),
        enabled: values.disabled === true ? false : undefined,
      });
      const path = saveLocalModelsConfig(REPO_ROOT, config);
      console.log(`Added ${id} to ${path}`);
      break;
    }
    case "add-anthropic": {
      const { values } = parseArgs({
        args,
        allowPositionals: false,
        options: {
          id: { type: "string" },
          model: { type: "string" },
          "api-key-env": { type: "string" },
          "base-url": { type: "string" },
          "max-concurrent": { type: "string" },
          "max-tokens": { type: "string" },
          "timeout-ms": { type: "string" },
          disabled: { type: "boolean" },
        },
      });
      ensureLocalModelsConfig(REPO_ROOT);
      const { config } = await loadModelsConfig(REPO_ROOT);
      const id = requireFlag(values, "id");
      if (findModel(config, id)) throw new Error(`model id already exists: ${id}`);
      config.models.push({
        id,
        kind: "anthropic",
        modelName: requireFlag(values, "model"),
        apiKeyEnvVar: requireFlag(values, "api-key-env"),
        baseUrl: values["base-url"] as string | undefined,
        maxConcurrent: parsePositiveInteger(values["max-concurrent"], "--max-concurrent"),
        maxTokens: parsePositiveInteger(values["max-tokens"], "--max-tokens"),
        timeoutMs: parsePositiveInteger(values["timeout-ms"], "--timeout-ms"),
        enabled: values.disabled === true ? false : undefined,
      });
      const path = saveLocalModelsConfig(REPO_ROOT, config);
      console.log(`Added ${id} to ${path}`);
      break;
    }
    default:
      console.log(`Usage:
  bun bench/src/cli.ts models list
  bun bench/src/cli.ts models init
  bun bench/src/cli.ts models validate
  bun bench/src/cli.ts models set-judge <model-id>
  bun bench/src/cli.ts models add-openai-compatible --id <id> --provider <provider-id> --model <name> --base-url <url> [--api-key-env <ENV>] [--header Name=Value]... [--reasoning-effort <effort>] [--max-concurrent <n>] [--max-tokens <n>] [--timeout-ms <n>] [--disabled]
  bun bench/src/cli.ts models add-anthropic --id <id> --model <name> --api-key-env <ENV> [--base-url <url>] [--max-concurrent <n>] [--max-tokens <n>] [--timeout-ms <n>] [--disabled]
  bun bench/src/cli.ts models remove <model-id>`);
      if (subcommand) process.exit(1);
  }
}

async function main(): Promise<void> {
  const subcommand = process.argv[2];

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    usage();
    return;
  }

  const rest = process.argv.slice(3);

  switch (subcommand) {
    case "list": {
      await cmdList();
      break;
    }
    case "run": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          models: { type: "string" },
          judge: { type: "string" },
          judges: { type: "string" },
          concurrency: { type: "string" },
          "dry-run": { type: "boolean" },
          "no-judge": { type: "boolean" },
        },
      });
      await cmdRun(positionals, values);
      break;
    }
    case "report": {
      const { values } = parseArgs({
        args: rest,
        allowPositionals: false,
        options: {
          out: { type: "string" },
          batch: { type: "string" },
          "all-runs": { type: "boolean" },
        },
      });
      await cmdReport(values);
      break;
    }
    case "models": {
      await cmdModels(rest);
      break;
    }
    default:
      usage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
