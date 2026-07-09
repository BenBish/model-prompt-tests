import { parseArgs } from "node:util";
import { discoverPromptFiles, loadPrompts } from "./parser/discover";
import { parsePromptFile } from "./parser/promptTemplate";
import { modelMatrix, judgeModel as defaultJudgeModel } from "./config/models.config";
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
  bun bench/src/cli.ts run <prompt-glob-or-all> [--models id1,id2] [--judge <id>] [--concurrency <n>] [--dry-run] [--no-judge]
  bun bench/src/cli.ts report [--out <path>] [--batch <run_batch_id>] [--all-runs]
  bun bench/src/cli.ts list`);
}

function resolveMatrix(modelsFlag: string | undefined): ModelMatrixEntry[] {
  if (!modelsFlag) return modelMatrix;
  const ids = new Set(modelsFlag.split(",").map((s) => s.trim()));
  const resolved = modelMatrix.filter((entry) => ids.has(entry.id));
  const missing = [...ids].filter((id) => !resolved.some((e) => e.id === id));
  if (missing.length > 0) {
    throw new Error(`unknown model id(s) in --models: ${missing.join(", ")}`);
  }
  return resolved;
}

function resolveJudge(judgeFlag: string | undefined): ModelMatrixEntry {
  const judgeId = judgeFlag ?? process.env.BENCH_JUDGE_MODEL_ID ?? defaultJudgeModel.id;
  if (judgeId === defaultJudgeModel.id) return defaultJudgeModel;
  const found = modelMatrix.find((entry) => entry.id === judgeId);
  if (!found) {
    throw new Error(`unknown judge model id: ${judgeId}`);
  }
  return found;
}

async function cmdList(): Promise<void> {
  const promptFiles = await discoverPromptFiles(REPO_ROOT);
  console.log(`Prompts (${promptFiles.length}):`);
  for (const file of promptFiles) {
    const prompt = await parsePromptFile(file, REPO_ROOT);
    console.log(`  ${prompt.id}`);
  }

  console.log(`\nModel matrix (${modelMatrix.length}):`);
  for (const entry of modelMatrix) {
    console.log(`  ${entry.id}  (${entry.kind === "anthropic" ? "anthropic" : entry.providerId}: ${entry.modelName})`);
  }

  console.log(`\nDefault judge: ${defaultJudgeModel.id} (${defaultJudgeModel.modelName})`);
}

async function cmdRun(positionals: string[], values: Record<string, unknown>): Promise<void> {
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

  const matrix = resolveMatrix(values.models as string | undefined);
  if (matrix.length === 0) {
    console.error("No models resolved from --models filter.");
    process.exit(1);
  }

  const useJudge = values["no-judge"] !== true;
  const judgeEntry = useJudge ? resolveJudge(values.judge as string | undefined) : undefined;

  if (values["dry-run"]) {
    console.log(`Would run ${prompts.length} prompt(s) x ${matrix.length} model(s):`);
    for (const prompt of prompts) console.log(`  prompt: ${prompt.id}`);
    for (const entry of matrix) console.log(`  model:  ${entry.id}`);
    if (judgeEntry) console.log(`  judge:  ${judgeEntry.id}`);
    console.log("(dry run — no network calls made)");
    return;
  }

  const runners = matrix.map((entry) =>
    candidateRunnerFromAdapter(entry.id, createAdapter(entry), entry.maxConcurrent),
  );

  const db = openDb(DB_PATH);
  const concurrency = values.concurrency ? Number(values.concurrency) : DEFAULT_CONCURRENCY;

  await runBatch({
    db,
    prompts,
    runners,
    defaultConcurrency: concurrency,
    judge: judgeEntry
      ? { adapter: createAdapter(judgeEntry), modelId: judgeEntry.id }
      : undefined,
  });
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
  await Bun.write(outPath, html);
  await Bun.write(`${REPORTS_DIR}/latest.html`, html);

  console.log(`Report written to ${outPath}`);
  console.log(`Also mirrored to ${REPORTS_DIR}/latest.html`);
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
    default:
      usage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
