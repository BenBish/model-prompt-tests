import { loadModelsConfig } from "../config/modelConfig";
import { createAdapter } from "../providers/registry";
import { openDb } from "../db/client";
import { renderToolProbeSection } from "./renderToolProbeSection";
import { runToolProbe, type ToolProbeCandidate } from "./runToolProbe";
import { TOOL_PROBE_CASES } from "./toolCases";

export async function cmdHermesTools(
  repoRoot: string,
  values: Record<string, unknown>,
): Promise<void> {
  const modelsFlag = values.models as string | undefined;
  if (!modelsFlag) throw new Error("--models is required (comma-separated bench model ids)");

  const { config } = await loadModelsConfig(repoRoot);
  const ids = modelsFlag
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const entries = ids.map((id) => {
    const entry = config.models.find((m) => m.id === id);
    if (!entry) throw new Error(`unknown model id "${id}" in --models. Try "bench models list".`);
    return entry;
  });

  if (values["dry-run"]) {
    console.log(`Would run ${TOOL_PROBE_CASES.length} tool case(s) x ${entries.length} model(s):`);
    for (const c of TOOL_PROBE_CASES) console.log(`  case:  ${c.id}${c.expect.shouldNotCall ? " (negative)" : ""}`);
    for (const entry of entries) console.log(`  model: ${entry.id}`);
    console.log("(dry run — no network calls made)");
    return;
  }

  const candidates: ToolProbeCandidate[] = entries.map((entry) => ({
    modelId: entry.id,
    providerId: entry.kind === "anthropic" ? "anthropic" : entry.providerId,
    adapter: createAdapter(entry),
    maxConcurrent: entry.maxConcurrent,
  }));

  const db = openDb(`${repoRoot}/bench/data/bench.sqlite`);
  const concurrency = values.concurrency ? Number(values.concurrency) : undefined;

  const summary = await runToolProbe({ db, candidates, defaultConcurrency: concurrency });

  console.log(`\nHermes tool probe ${summary.runBatchId}:\n`);
  console.log(renderToolProbeSection(summary.candidateSummaries));

  const anyBelowGate = summary.candidateSummaries.some((s) => s.wellFormedRate < 0.9);
  if (anyBelowGate) {
    console.log(
      "\n[gate] one or more candidates scored below 90% well-formed tool calls — treat as disqualifying " +
        "for any tool-calling agent role regardless of prose quality elsewhere.",
    );
  }
}
