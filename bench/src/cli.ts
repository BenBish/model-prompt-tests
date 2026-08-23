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
import { getLatestRunBatchId } from "./db/runsRepo";
import { queryReportData } from "./report/queryData";
import { renderReportHtml } from "./report/renderHtml";
import { renderCompareHtml } from "./report/renderCompareHtml";
import { buildAssessmentSummary, buildNarrativePrompt, renderAssessmentMarkdown } from "./report/renderAssessment";
import { exportBatch, validateExportName } from "./export/exportBatch";
import { publishSite } from "./publish/publishSite";
import type { ModelMatrixEntry } from "./providers/types";
import { resolveChairman, resolveJudge, resolveJudges } from "./config/judgeSelection";
import { parsePositiveInteger } from "./util/cliArgs";
import { cmdSweDoctor, cmdSweHealth, cmdSweList, cmdSweRun } from "./swe/cli";
import { cmdHermesTools } from "./hermes/cli";
import { querySweReportData } from "./swe/sweReportData";
import { renderSweAssessmentSection, renderSweReportSection } from "./swe/renderSweSection";
import { queryPeerRankReportData, queryPeerRankReportForReportBatches } from "./peerRank/reportData";
import {
  renderPeerRankAssessmentSection,
  renderPeerRankHtmlSection,
} from "./peerRank/renderPeerRankSection";
import { cmdCalibrate } from "./calibrate/cmd";
import { querySynthesisReportData, querySynthesisReportForReportBatches } from "./synthesize/reportData";
import { renderSynthesisAssessmentSection, renderSynthesisHtmlSection } from "./synthesize/renderSection";
import { groupsFromBatch, runSynthesisForGroups } from "./synthesize/groups";
import { getExperiment, getExperimentForBatch } from "./db/experimentsRepo";
import { compareExperiments } from "./experiment/compatibility";
import { manifestId, publicationIssues } from "./experiment/manifest";

const REPO_ROOT = process.cwd();
const DB_PATH = `${REPO_ROOT}/bench/data/bench.sqlite`;
const REPORTS_DIR = `${REPO_ROOT}/bench/reports`;
const BENCHMARK_RESULTS_DIR = `${REPO_ROOT}/benchmark-results`;
const DOCS_DIR = `${REPO_ROOT}/docs`;
const DEFAULT_CONCURRENCY = 3;

function usage(): void {
  console.log(`Usage:
  bun bench/src/cli.ts run <prompt-glob-or-all|calibration> [--models id1,id2] [--judge <id>] [--judges id1,id2] [--concurrency <n>] [--repeats <n>] [--dry-run] [--no-judge] [--peer-rank] [--synthesize] [--chairman <id>]
  bun bench/src/cli.ts synthesize (--batch <run_batch_id> | --latest) [--prompts id1,id2] [--chairman <id>] [--dry-run]
  bun bench/src/cli.ts calibrate [--batch <run_batch_id>] [--all-runs] [--human <file.json>] [--out <path>] [--subset]
  bun bench/src/cli.ts report [--out <path>] [--batch <run_batch_id>] [--all-runs] [--narrative] [--judge <id>]
  bun bench/src/cli.ts report --compare <batchA> --compare <batchB> [--out <path>]
  bun bench/src/cli.ts export --name <slug> (--batch <run_batch_id> | --latest)
  bun bench/src/cli.ts reproduce --batch <run_batch_id>
  bun bench/src/cli.ts publish [--out <dir>] [--results-dir <dir>]
  bun bench/src/cli.ts models <list|init|validate|set-judge|add-openai-compatible|add-anthropic|remove>
  bun bench/src/cli.ts list
  bun bench/src/cli.ts swe list
  bun bench/src/cli.ts swe doctor [--harnesses <ids>] [--timeout <ms>]
  bun bench/src/cli.ts swe health [task-or-all]
  bun bench/src/cli.ts swe run <task-glob-or-all> --harnesses <ids> --models <aliases> [--repeats <n>] [--concurrency <n>] [--judge <id>] [--judges id1,id2] [--no-judge] [--keep-workspaces] [--dry-run] [--timeout <ms>]
  bun bench/src/cli.ts hermes tools --models <ids> [--concurrency <n>] [--dry-run]`);
}

function requireFlag(values: Record<string, unknown>, key: string): string {
  const value = values[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing required --${key}`);
  }
  return value;
}

function parseCommaSeparatedIds(value: unknown, flag: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${flag} must be a comma-separated list of ids`);
  }
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (ids.length === 0) {
    throw new Error(`${flag} must be a comma-separated list of ids`);
  }
  return ids;
}

function parsePricingFlags(
  values: Record<string, unknown>,
): { inputPerMTok: number; outputPerMTok: number } | undefined {
  const inputRaw = values["input-per-mtok"];
  const outputRaw = values["output-per-mtok"];
  if (inputRaw === undefined && outputRaw === undefined) return undefined;
  if (inputRaw === undefined || outputRaw === undefined) {
    throw new Error("pricing requires both --input-per-mtok and --output-per-mtok");
  }
  const inputPerMTok = Number(inputRaw);
  const outputPerMTok = Number(outputRaw);
  if (!Number.isFinite(inputPerMTok) || inputPerMTok < 0 || !Number.isFinite(outputPerMTok) || outputPerMTok < 0) {
    throw new Error("--input-per-mtok and --output-per-mtok must be non-negative numbers");
  }
  return { inputPerMTok, outputPerMTok };
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
  const chairman = resolveChairman(config, undefined);
  console.log(`\nDefault judge: ${judge.id} (${judge.modelName})`);
  console.log(`Default chairman: ${chairman.id} (${chairman.modelName})`);
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

  const repeats = parsePositiveInteger(values.repeats, "--repeats") ?? 1;

  const peerRank = values["peer-rank"] === true;
  const synthesize = values.synthesize === true;
  const chairmanEntry = synthesize
    ? resolveChairman(config, values.chairman as string | undefined)
    : undefined;

  if (values["dry-run"]) {
    console.log(
      `Would run ${prompts.length} prompt(s) x ${matrix.length} model(s)` +
        (repeats > 1 ? ` x ${repeats} repeat(s):` : ":"),
    );
    for (const prompt of prompts) console.log(`  prompt: ${prompt.id}`);
    for (const entry of matrix) console.log(`  model:  ${entry.id}`);
    for (const entry of judgeEntries) console.log(`  judge:  ${entry.id}`);
    if (peerRank) {
      console.log(
        `  peer-rank: enabled (≈ +${matrix.length} large-context ranking call(s) per prompt/repeat with ≥2 ok models)`,
      );
    }
    if (synthesize && chairmanEntry) {
      console.log(
        `  synthesize: chairman ${chairmanEntry.id} (≈ +1 large-context call per prompt/repeat with ≥2 ok models)`,
      );
    }
    console.log("(dry run — no network calls made)");
    return;
  }

  if (peerRank) {
    console.warn(
      "[warn] --peer-rank adds roughly one large-context ranking call per successful candidate " +
        "per prompt/repeat (≈ +N calls when N models succeed). Cost and latency can more than double " +
        "versus parallel-only runs. Rankings are a secondary signal and do not replace rubric scores.",
    );
  }
  if (synthesize) {
    console.warn(
      "[warn] --synthesize adds one large-context chairman call per prompt/repeat with ≥2 ok models. " +
        "This produces a combined answer for a human reader and does not change rubric scores.",
    );
  }
  if (values.chairman && !synthesize) {
    console.warn("[warn] --chairman is ignored without --synthesize");
  }

  const runners = matrix.map((entry) =>
    candidateRunnerFromAdapter(entry.id, createAdapter(entry), entry.maxConcurrent, entry.pricing, entry),
  );

  const db = openDb(DB_PATH);
  const concurrency = values.concurrency ? Number(values.concurrency) : DEFAULT_CONCURRENCY;

  const summary = await runBatch({
    db,
    prompts,
    runners,
    defaultConcurrency: concurrency,
    repeats,
    judges: judgeEntries.map((entry) => ({
      adapter: createAdapter(entry),
      modelId: entry.id,
      maxConcurrent: entry.maxConcurrent,
    })),
    peerRank: peerRank
      ? {
          rankers: matrix.map((entry) => ({
            adapter: createAdapter(entry),
            modelId: entry.id,
            maxConcurrent: entry.maxConcurrent,
            pricing: entry.pricing,
          })),
        }
      : undefined,
    synthesize:
      synthesize && chairmanEntry
        ? {
            chairman: {
              adapter: createAdapter(chairmanEntry),
              modelId: chairmanEntry.id,
              maxConcurrent: chairmanEntry.maxConcurrent,
              pricing: chairmanEntry.pricing,
            },
          }
        : undefined,
  });
  if (
    summary.errored > 0 ||
    summary.judgeErrored > 0 ||
    summary.peerRankErrored > 0 ||
    summary.synthesizeErrored > 0
  ) {
    process.exitCode = 1;
  }
}

async function cmdSynthesize(values: Record<string, unknown>): Promise<void> {
  const { config } = await loadModelsConfig(REPO_ROOT);
  const chairmanEntry = resolveChairman(config, values.chairman as string | undefined);
  const prompts = await loadPrompts(REPO_ROOT, "all");
  const promptTextById = new Map(prompts.map((p) => [p.id, p.promptText]));
  const promptFilter = parseCommaSeparatedIds(values.prompts, "--prompts");
  if (promptFilter) {
    const unknown = promptFilter.filter((id) => !promptTextById.has(id));
    if (unknown.length > 0) {
      throw new Error(`unknown prompt id(s) in --prompts: ${unknown.join(", ")}`);
    }
  }

  const db = openDb(DB_PATH);
  const runBatchId =
    typeof values.batch === "string"
      ? values.batch
      : values.latest === true
        ? getLatestRunBatchId(db)
        : undefined;
  if (!runBatchId) {
    if (values.latest === true) {
      if (values["dry-run"] === true) {
        console.log("Would synthesize 0 group(s) (no run batches in the database).");
        return;
      }
      throw new Error("no run batches found; run a bench first");
    }
    throw new Error("synthesize requires --batch <run_batch_id> or --latest");
  }

  let groups = groupsFromBatch(db, runBatchId, promptTextById);
  if (promptFilter) {
    const promptIdsInBatch = new Set(groups.map((group) => group.promptId));
    const missingFromBatch = promptFilter.filter((id) => !promptIdsInBatch.has(id));
    if (missingFromBatch.length > 0) {
      throw new Error(
        `prompt id(s) not found in batch ${runBatchId}: ${missingFromBatch.join(", ")}`,
      );
    }
    const wanted = new Set(promptFilter);
    groups = groups.filter((g) => wanted.has(g.promptId));
  }
  const eligible = groups.filter((g) => g.candidates.length >= 2);

  if (values["dry-run"] === true) {
    console.log(
      `Would synthesize ${eligible.length} group(s) from batch ${runBatchId} with chairman ${chairmanEntry.id}` +
        (eligible.length !== groups.length ? ` (${groups.length - eligible.length} skipped, <2 candidates)` : "") +
        ":",
    );
    for (const group of eligible) {
      console.log(
        `  ${group.promptId}` +
          (group.repeatIndex > 0 ? ` repeat ${group.repeatIndex}` : "") +
          ` (${group.candidates.map((c) => c.modelId).join(", ")})`,
      );
    }
    console.log("(dry run — no network calls made)");
    return;
  }

  if (eligible.length === 0) {
    console.log(`No synthesizable groups in batch ${runBatchId} (need ≥2 ok prompt candidates).`);
    return;
  }

  const summary = await runSynthesisForGroups(
    db,
    runBatchId,
    groups,
    {
      adapter: createAdapter(chairmanEntry),
      modelId: chairmanEntry.id,
      maxConcurrent: chairmanEntry.maxConcurrent,
      pricing: chairmanEntry.pricing,
    },
    DEFAULT_CONCURRENCY,
  );
  console.log(
    `Synthesize ${runBatchId}: ${summary.ok} ok, ${summary.errored} errors, ${summary.skipped} skipped. ` +
      "Does not change avgScore.",
  );
  if (summary.errored > 0) process.exitCode = 1;
}

async function cmdReportCompare(values: Record<string, unknown>): Promise<void> {
  const compareFlag = values.compare;
  if (!Array.isArray(compareFlag) || compareFlag.length !== 2) {
    throw new Error("--compare requires exactly two batch ids: --compare <batchA> --compare <batchB>");
  }
  const [batchBefore, batchAfter] = compareFlag as [string, string];
  const db = openDb(DB_PATH);
  const experimentBefore = getExperimentForBatch(db, batchBefore);
  const experimentAfter = getExperimentForBatch(db, batchAfter);
  if (!experimentBefore || !experimentAfter) throw new Error("comparison requires experiment provenance; one or both batches are legacy rows");
  const compatibility = compareExperiments(experimentBefore.manifest, experimentAfter.manifest);
  if (!compatibility.compatible && values["allow-incompatible"] !== true) {
    throw new Error(`incompatible experiments:\n${compatibility.differences.map((d) => `- [${d.category}] ${d.path}`).join("\n")}\nPass --allow-incompatible for an explicit warning-path override.`);
  }
  if (!compatibility.performanceComparable) {
    const justification = values["allow-cross-domain-performance"];
    if (typeof justification !== "string" || justification.trim() === "") throw new Error("execution environments differ; refusing cross-domain performance rankings. Pass --allow-cross-domain-performance <justification> for an explicit analysis override.");
    console.warn(`[warn] cross-domain performance override: ${justification}`);
  }
  const dataBefore = queryReportData(db, { runBatchId: batchBefore, allRuns: true });
  const dataAfter = queryReportData(db, { runBatchId: batchAfter, allRuns: true });
  const sweBefore = querySweReportData(db, { runBatchId: batchBefore, allRuns: true });
  const sweAfter = querySweReportData(db, { runBatchId: batchAfter, allRuns: true });
  if (dataBefore.promptIds.length === 0 && sweBefore.taskIds.length === 0) throw new Error(`no runs found for batch "${batchBefore}"`);
  if (dataAfter.promptIds.length === 0 && sweAfter.taskIds.length === 0) throw new Error(`no runs found for batch "${batchAfter}"`);

  const html = renderCompareHtml(
    batchBefore,
    dataBefore.summaries,
    batchAfter,
    dataAfter.summaries,
    new Date().toISOString(),
    { before: sweBefore.summaries, after: sweAfter.summaries },
  );
  const outPath =
    (values.out as string | undefined) ?? `${REPORTS_DIR}/compare-${batchBefore}-vs-${batchAfter}.html`;
  await Bun.write(outPath, html);
  console.log(`Compare report written to ${outPath}`);
}

async function cmdExport(values: Record<string, unknown>): Promise<void> {
  const name = requireFlag(values, "name");
  // Validate the slug before opening the DB / resolving batches so bad names fail fast.
  validateExportName(name);

  const batchFlag = values.batch as string | undefined;
  if (batchFlag && values.latest) {
    throw new Error("use either --batch or --latest, not both");
  }
  if (!batchFlag && !values.latest) {
    throw new Error("export requires --name <slug> and either --batch <run_batch_id> or --latest");
  }

  const db = openDb(DB_PATH);
  const runBatchId = batchFlag ?? getLatestRunBatchId(db);
  if (!runBatchId) {
    throw new Error("no runs found in the database yet");
  }

  const { config } = await loadModelsConfig(REPO_ROOT);
  const outDir = `${BENCHMARK_RESULTS_DIR}/${name}`;
  const result = await exportBatch({ db, config, runBatchId, name, outDir });

  console.log(`Exported batch ${runBatchId} to ${result.outDir}/`);
  for (const file of result.files) console.log(`  ${file}`);
}

async function cmdPublish(values: Record<string, unknown>): Promise<void> {
  const resultsDir = (values["results-dir"] as string | undefined) ?? BENCHMARK_RESULTS_DIR;
  const outDir = (values.out as string | undefined) ?? DOCS_DIR;

  const result = await publishSite({ resultsDir, outDir });

  console.log(`Published ${result.published.length} run(s) to ${result.outDir}/`);
  for (const name of result.published) console.log(`  runs/${name}/index.html`);
  if (result.skipped.length > 0) {
    console.log(`Skipped ${result.skipped.length} entr${result.skipped.length === 1 ? "y" : "ies"}:`);
    for (const s of result.skipped) console.log(`  ${s.name}: ${s.reason}`);
  }
  console.log(`Index written to ${outDir}/index.html`);
  console.log(
    `To serve on GitHub Pages: repo Settings -> Pages -> Deploy from a branch -> main / docs (one-time setup).`,
  );
}

async function cmdReport(values: Record<string, unknown>): Promise<void> {
  if (values.compare !== undefined) {
    await cmdReportCompare(values);
    return;
  }

  const db = openDb(DB_PATH);
  const runBatchId = (values.batch as string | undefined) ?? (values["all-runs"] === true ? undefined : getLatestRunBatchId(db));
  const data = queryReportData(db, {
    runBatchId,
    allRuns: values["all-runs"] === true,
  });

  const sweData = querySweReportData(db, {
    runBatchId,
    allRuns: values["all-runs"] === true,
  });
  const sweHtmlSection = renderSweReportSection(sweData);
  const sweAssessmentSection = renderSweAssessmentSection(sweData);

  const reportBatchIds = new Set<string>();
  for (const byModel of data.rows.values()) {
    for (const rows of byModel.values()) {
      for (const row of rows) reportBatchIds.add(row.runBatchId);
    }
  }
  const peerRankData =
    runBatchId !== undefined
      ? queryPeerRankReportData(db, { runBatchId })
      : reportBatchIds.size > 0
        ? queryPeerRankReportForReportBatches(db, [...reportBatchIds])
        : queryPeerRankReportData(db, { allRuns: values["all-runs"] === true });
  const peerRankHtmlSection = renderPeerRankHtmlSection(peerRankData);
  const peerRankAssessmentSection = renderPeerRankAssessmentSection(peerRankData);

  const synthesisData =
    runBatchId !== undefined
      ? querySynthesisReportData(db, { runBatchId })
      : reportBatchIds.size > 0
        ? querySynthesisReportForReportBatches(db, [...reportBatchIds])
        : querySynthesisReportData(db, { allRuns: values["all-runs"] === true });
  const synthesisHtmlSection = renderSynthesisHtmlSection(synthesisData);
  const synthesisAssessmentSection = renderSynthesisAssessmentSection(synthesisData);

  const generatedAt = new Date().toISOString();
  const html = renderReportHtml(
    data,
    generatedAt,
    sweHtmlSection,
    peerRankHtmlSection,
    synthesisHtmlSection,
  );

  const timestamp = generatedAt.replace(/[:.]/g, "-");
  const outPath = (values.out as string | undefined) ?? `${REPORTS_DIR}/${timestamp}.html`;
  const summaryPath = /\.html?$/i.test(outPath)
    ? outPath.replace(/\.html?$/i, ".summary.json")
    : `${outPath}.summary.json`;
  const assessmentPath = /\.html?$/i.test(outPath)
    ? outPath.replace(/\.html?$/i, ".assessment.md")
    : `${outPath}.assessment.md`;

  const assessment = renderAssessmentMarkdown(
    data,
    {
      generatedAt,
      reportPath: outPath,
      summaryPath,
      runBatchId,
    },
    sweAssessmentSection,
    peerRankAssessmentSection,
    synthesisAssessmentSection,
  );
  const summaryJson = sweData.summaries.length > 0
    ? { prompt: data.summaries, swe: sweData.summaries }
    : data.summaries;

  // Write the deterministic outputs first: they're fully computable from the local DB and
  // should never be lost because an optional, network-dependent narrative call failed.
  await Bun.write(outPath, html);
  await Bun.write(summaryPath, `${JSON.stringify(summaryJson, null, 2)}\n`);
  await Bun.write(assessmentPath, assessment);
  await Bun.write(`${REPORTS_DIR}/latest.html`, html);
  await Bun.write(`${REPORTS_DIR}/latest.summary.json`, `${JSON.stringify(summaryJson, null, 2)}\n`);
  await Bun.write(`${REPORTS_DIR}/latest.assessment.md`, assessment);

  console.log(`Report written to ${outPath}`);
  console.log(`Summary written to ${summaryPath}`);
  console.log(`Assessment written to ${assessmentPath}`);
  console.log(`Also mirrored to ${REPORTS_DIR}/latest.html`);
  console.log(`Also mirrored to ${REPORTS_DIR}/latest.summary.json`);
  console.log(`Also mirrored to ${REPORTS_DIR}/latest.assessment.md`);

  if (values.narrative) {
    let narrativeSection: string;
    try {
      const { config } = await loadModelsConfig(REPO_ROOT);
      const judgeEntry = resolveJudge(config, values.judge as string | undefined);
      const adapter = createAdapter(judgeEntry);
      const assessmentSummary = buildAssessmentSummary(
        data,
        {
          generatedAt,
          reportPath: outPath,
          summaryPath,
          runBatchId,
        },
        sweData.summaries.length > 0 ? sweData.summaries : undefined,
      );
      const { systemPrompt, userPrompt } = buildNarrativePrompt(assessmentSummary);
      const response = await adapter.call({ systemPrompt, userPrompt, temperature: 0.3 });
      narrativeSection = `\n## Analysis (LLM-generated by ${judgeEntry.id})\n\n${response.text.trim()}\n`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[warn] --narrative failed: ${message}`);
      narrativeSection = `\n## Analysis (LLM-generated)\n\nNarrative generation failed: ${message}\n`;
    }

    const assessmentWithNarrative = assessment + narrativeSection;
    await Bun.write(assessmentPath, assessmentWithNarrative);
    await Bun.write(`${REPORTS_DIR}/latest.assessment.md`, assessmentWithNarrative);
    console.log(`Assessment updated with narrative at ${assessmentPath}`);
  }
}

async function cmdReproduce(values: Record<string, unknown>): Promise<void> {
  const db = openDb(DB_PATH);
  const batch = values.batch as string | undefined;
  const id = values.experiment as string | undefined;
  if ((batch ? 1 : 0) + (id ? 1 : 0) !== 1) throw new Error("reproduce requires exactly one of --batch or --experiment");
  const experiment = batch ? getExperimentForBatch(db, batch) : getExperiment(db, id!);
  if (!experiment) throw new Error("experiment provenance not found (legacy batches cannot be rehydrated)");
  const calculated = manifestId(experiment.manifest);
  if (calculated !== experiment.id) throw new Error(`manifest hash mismatch: stored ${experiment.id}, calculated ${calculated}`);
  const issues = publicationIssues(experiment.manifest);
  console.log(JSON.stringify({ id: experiment.id, valid: true, publicationEligible: issues.length === 0, publicationIssues: issues, manifest: experiment.manifest }, null, 2));
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
      const chairman = resolveChairman(config, undefined);
      console.log(`\nDefault judge: ${judge.id} (${judge.modelName})`);
      console.log(`Default chairman: ${chairman.id} (${chairman.modelName})`);
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
    case "set-chairman": {
      const modelId = args[0];
      if (!modelId) throw new Error("usage: bun run bench models set-chairman <model-id>");
      ensureLocalModelsConfig(REPO_ROOT);
      const { config } = await loadModelsConfig(REPO_ROOT);
      if (!findModel(config, modelId)) {
        throw new Error(`unknown model id: ${modelId}`);
      }
      config.chairman = { modelId };
      const path = saveLocalModelsConfig(REPO_ROOT, config);
      console.log(`Default chairman set to ${modelId} in ${path}`);
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
          "input-per-mtok": { type: "string" },
          "output-per-mtok": { type: "string" },
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
        pricing: parsePricingFlags(values),
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
          "input-per-mtok": { type: "string" },
          "output-per-mtok": { type: "string" },
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
        pricing: parsePricingFlags(values),
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
  bun bench/src/cli.ts models set-chairman <model-id>
  bun bench/src/cli.ts models add-openai-compatible --id <id> --provider <provider-id> --model <name> --base-url <url> [--api-key-env <ENV>] [--header Name=Value]... [--reasoning-effort <effort>] [--max-concurrent <n>] [--max-tokens <n>] [--timeout-ms <n>] [--input-per-mtok <n>] [--output-per-mtok <n>] [--disabled]
  bun bench/src/cli.ts models add-anthropic --id <id> --model <name> --api-key-env <ENV> [--base-url <url>] [--max-concurrent <n>] [--max-tokens <n>] [--timeout-ms <n>] [--input-per-mtok <n>] [--output-per-mtok <n>] [--disabled]
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
          repeats: { type: "string" },
          "dry-run": { type: "boolean" },
          "no-judge": { type: "boolean" },
          "peer-rank": { type: "boolean" },
          synthesize: { type: "boolean" },
          chairman: { type: "string" },
        },
      });
      await cmdRun(positionals, values);
      break;
    }
    case "synthesize": {
      const { values } = parseArgs({
        args: rest,
        allowPositionals: false,
        options: {
          batch: { type: "string" },
          latest: { type: "boolean" },
          prompts: { type: "string" },
          chairman: { type: "string" },
          "dry-run": { type: "boolean" },
        },
      });
      await cmdSynthesize(values);
      break;
    }
    case "calibrate": {
      const { values } = parseArgs({
        args: rest,
        allowPositionals: false,
        options: {
          batch: { type: "string" },
          "all-runs": { type: "boolean" },
          human: { type: "string" },
          out: { type: "string" },
          subset: { type: "boolean" },
        },
      });
      await cmdCalibrate(REPO_ROOT, values);
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
          narrative: { type: "boolean" },
          judge: { type: "string" },
          compare: { type: "string", multiple: true },
          "allow-incompatible": { type: "boolean" },
          "allow-cross-domain-performance": { type: "string" },
        },
      });
      await cmdReport(values);
      break;
    }
    case "export": {
      const { values } = parseArgs({
        args: rest,
        allowPositionals: false,
        options: {
          name: { type: "string" },
          batch: { type: "string" },
          latest: { type: "boolean" },
        },
      });
      await cmdExport(values);
      break;
    }
    case "reproduce": {
      const { values } = parseArgs({ args: rest, allowPositionals: false, options: { batch: { type: "string" }, experiment: { type: "string" } } });
      await cmdReproduce(values);
      break;
    }
    case "publish": {
      const { values } = parseArgs({
        args: rest,
        allowPositionals: false,
        options: {
          out: { type: "string" },
          "results-dir": { type: "string" },
        },
      });
      await cmdPublish(values);
      break;
    }
    case "models": {
      await cmdModels(rest);
      break;
    }
    case "swe": {
      const sweSubcommand = rest[0];
      const sweRest = rest.slice(1);
      if (sweSubcommand === "list") {
        await cmdSweList(REPO_ROOT);
      } else if (sweSubcommand === "doctor") {
        const { values } = parseArgs({
          args: sweRest,
          allowPositionals: false,
          options: {
            harnesses: { type: "string" },
            timeout: { type: "string" },
          },
        });
        await cmdSweDoctor(REPO_ROOT, values);
      } else if (sweSubcommand === "health") {
        const { positionals } = parseArgs({ args: sweRest, allowPositionals: true });
        await cmdSweHealth(REPO_ROOT, positionals[0] ?? "all");
      } else if (sweSubcommand === "run") {
        const { values, positionals } = parseArgs({
          args: sweRest,
          allowPositionals: true,
          options: {
            harnesses: { type: "string" },
            models: { type: "string" },
            judge: { type: "string" },
            judges: { type: "string" },
            repeats: { type: "string" },
            concurrency: { type: "string" },
            timeout: { type: "string" },
            "dry-run": { type: "boolean" },
            "no-judge": { type: "boolean" },
            "keep-workspaces": { type: "boolean" },
          },
        });
        await cmdSweRun(REPO_ROOT, positionals, values);
      } else {
        usage();
        process.exit(1);
      }
      break;
    }
    case "hermes": {
      const hermesSubcommand = rest[0];
      const hermesRest = rest.slice(1);
      if (hermesSubcommand === "tools") {
        const { values } = parseArgs({
          args: hermesRest,
          allowPositionals: false,
          options: {
            models: { type: "string" },
            concurrency: { type: "string" },
            "dry-run": { type: "boolean" },
          },
        });
        await cmdHermesTools(REPO_ROOT, values);
      } else {
        usage();
        process.exit(1);
      }
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
