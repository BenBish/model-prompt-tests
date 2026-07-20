import { loadModelsConfig, type BenchModelsConfig } from "../config/modelConfig";
import { resolveJudges } from "../config/judgeSelection";
import { openDb } from "../db/client";
import { createAdapter } from "../providers/registry";
import { findDuplicate, parsePositiveInteger } from "../util/cliArgs";
import { loadTasks } from "./discoverTasks";
import { createClaudeCodeHarness } from "./harness/claudeCode";
import { createCodexHarness } from "./harness/codex";
import { createGenericCliHarness } from "./harness/genericCli";
import { benchModelsLookup, createRawApiHarness } from "./harness/rawApi";
import type { SweHarness } from "./harness/types";
import {
  enabledHarnessMatrix,
  findHarness,
  loadHarnessesConfig,
  type HarnessMatrixEntry,
} from "./harnessConfig";
import { formatDoctorReport, runSweDoctor } from "./doctor";
import { runSweBatch, type SweRunnerCell } from "./runSweBatch";

export function createHarnessInstance(entry: HarnessMatrixEntry, modelsConfig: BenchModelsConfig): SweHarness {
  if (entry.kind === "claude-code") return createClaudeCodeHarness(entry);
  if (entry.kind === "raw-api") return createRawApiHarness(entry, benchModelsLookup(modelsConfig));
  if (entry.kind === "codex") return createCodexHarness(entry);
  if (entry.kind === "generic-cli") return createGenericCliHarness(entry);
  throw new Error(`unsupported harness kind "${(entry as { kind: string }).kind}"`);
}

export async function cmdSweList(repoRoot: string): Promise<void> {
  const tasks = await loadTasks(repoRoot, "all");
  console.log(`SWE tasks (${tasks.length}):`);
  for (const task of tasks) {
    const tagsSuffix = task.tags.length > 0 ? ` (${task.tags.join(", ")})` : "";
    console.log(`  ${task.id}  [${task.type}]${tagsSuffix}`);
  }

  const { config: harnessesConfig } = await loadHarnessesConfig(repoRoot);
  const { config: modelsConfig } = await loadModelsConfig(repoRoot);
  console.log(`\nHarnesses (${enabledHarnessMatrix(harnessesConfig).length} enabled, ${harnessesConfig.harnesses.length} configured):`);
  for (const entry of harnessesConfig.harnesses) {
    const enabledSuffix = entry.enabled === false ? " [disabled]" : "";
    let availabilityText: string;
    try {
      const harness = createHarnessInstance(entry, modelsConfig);
      const availability = await harness.available();
      availabilityText = availability.ok ? "available" : `unavailable (${availability.reason})`;
    } catch (err) {
      availabilityText = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
    console.log(`  ${entry.id}  (${entry.kind})${enabledSuffix} — ${availabilityText}`);
  }
}

function rejectDuplicates(ids: string[], flagName: string): void {
  const duplicate = findDuplicate(ids);
  if (duplicate) {
    throw new Error(`duplicate value in ${flagName}: "${duplicate}"`);
  }
}

interface ResolvedCellPlan {
  cells: SweRunnerCell[];
  errors: string[];
}

function resolveCells(
  harnessEntries: HarnessMatrixEntry[],
  modelsConfig: BenchModelsConfig,
  modelAliases: string[],
): ResolvedCellPlan {
  const cells: SweRunnerCell[] = [];
  const errors: string[] = [];
  for (const entry of harnessEntries) {
    const harness = createHarnessInstance(entry, modelsConfig);
    for (const alias of modelAliases) {
      const resolved = harness.resolveModel(alias);
      if (!resolved) {
        errors.push(`model alias "${alias}" is not defined for harness "${entry.id}"`);
        continue;
      }
      cells.push({ harnessId: entry.id, harness, modelAlias: alias });
    }
  }
  return { cells, errors };
}

export async function cmdSweDoctor(repoRoot: string, values: Record<string, unknown> = {}): Promise<void> {
  const { config: harnessesConfig } = await loadHarnessesConfig(repoRoot);
  const { config: modelsConfig } = await loadModelsConfig(repoRoot);

  let entries = enabledHarnessMatrix(harnessesConfig);
  const harnessesFlag = values.harnesses as string | undefined;
  if (harnessesFlag) {
    const harnessIds = harnessesFlag
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    rejectDuplicates(harnessIds, "--harnesses");
    entries = harnessIds.map((id) => {
      const entry = findHarness(harnessesConfig, id);
      if (!entry) throw new Error(`unknown harness id "${id}"`);
      return entry;
    });
  }

  const timeoutMs = parsePositiveInteger(values.timeout, "--timeout");
  const results = await runSweDoctor(entries, modelsConfig, createHarnessInstance, {
    timeoutMs: timeoutMs ?? undefined,
  });
  console.log(formatDoctorReport(results));
  if (results.some((r) => !r.ok)) {
    process.exitCode = 1;
  }
}

export async function cmdSweRun(
  repoRoot: string,
  positionals: string[],
  values: Record<string, unknown>,
): Promise<void> {
  const selector = positionals[0];
  if (!selector) {
    throw new Error(
      "usage: bench swe run <task-glob-or-all> --harnesses <ids> --models <aliases> [options]. Try \"bench swe list\".",
    );
  }

  const harnessesFlag = values.harnesses as string | undefined;
  const modelsFlag = values.models as string | undefined;
  if (!harnessesFlag) throw new Error("--harnesses is required (comma-separated harness ids)");
  if (!modelsFlag) throw new Error("--models is required (comma-separated model aliases)");

  const tasks = await loadTasks(repoRoot, selector);
  if (tasks.length === 0) {
    throw new Error(`no SWE tasks matched selector "${selector}". Try "bun bench/src/cli.ts swe list".`);
  }

  const { config: harnessesConfig } = await loadHarnessesConfig(repoRoot);
  const { config: modelsConfig } = await loadModelsConfig(repoRoot);

  const harnessIds = harnessesFlag
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  rejectDuplicates(harnessIds, "--harnesses");
  const harnessEntries = harnessIds.map((id) => {
    const entry = findHarness(harnessesConfig, id);
    if (!entry) throw new Error(`unknown harness id "${id}"`);
    return entry;
  });

  const modelAliases = modelsFlag
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  rejectDuplicates(modelAliases, "--models");
  const { cells, errors } = resolveCells(harnessEntries, modelsConfig, modelAliases);
  if (errors.length > 0) {
    throw new Error(`unresolved harness/model combination(s):\n  ${errors.join("\n  ")}`);
  }

  const repeats = parsePositiveInteger(values.repeats, "--repeats") ?? 1;
  const concurrency = parsePositiveInteger(values.concurrency, "--concurrency");
  const timeoutOverrideMs = parsePositiveInteger(values.timeout, "--timeout");
  if (timeoutOverrideMs) {
    for (const task of tasks) task.agentTimeoutMs = timeoutOverrideMs;
  }

  if (values["dry-run"]) {
    console.log(
      `Would run ${tasks.length} task(s) x ${cells.length} harness/model cell(s)` +
        (repeats > 1 ? ` x ${repeats} repeat(s):` : ":"),
    );
    for (const task of tasks) console.log(`  task: ${task.id}`);
    for (const cell of cells) {
      const availability = await cell.harness.available();
      const availabilitySuffix = availability.ok ? "" : ` — UNAVAILABLE (${availability.reason})`;
      console.log(`  cell: ${cell.harnessId}:${cell.modelAlias}${availabilitySuffix}`);
    }
    const totalCells = tasks.length * cells.length * repeats;
    const worstCaseMs =
      tasks.reduce((sum, task) => sum + task.agentTimeoutMs + task.verifyTimeoutMs, 0) * cells.length * repeats;
    const effectiveConcurrency = concurrency ?? 2;
    console.log(
      `Total cells: ${totalCells}. Worst-case wall clock at concurrency ${effectiveConcurrency}: ` +
        `~${Math.round(worstCaseMs / effectiveConcurrency / 1000)}s (assumes every cell hits its timeout; typical runs finish much faster).`,
    );
    console.log("(dry run — no processes spawned, no network calls made)");
    return;
  }

  const useJudge = values["no-judge"] !== true;
  const judgeEntries = useJudge
    ? resolveJudges(modelsConfig, values.judge as string | undefined, values.judges as string | undefined)
    : [];

  const db = openDb(`${repoRoot}/bench/data/bench.sqlite`);
  const workspacesRoot = `${repoRoot}/bench/data/workspaces`;

  const summary = await runSweBatch({
    db,
    tasks,
    cells,
    workspacesRoot,
    repeats,
    defaultConcurrency: concurrency,
    keepWorkspaces: values["keep-workspaces"] === true,
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
