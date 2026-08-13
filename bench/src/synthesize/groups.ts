import type { Database } from "bun:sqlite";
import { getRunsForBatch } from "../db/runsRepo";
import { getPeerRanksForBatch } from "../db/peerRanksRepo";
import { insertSynthesis } from "../db/synthesesRepo";
import { createLimiter } from "../util/concurrency";
import { provenanceJson, runOneSynthesis, type Chairman } from "./runSynthesis";
import type { SynthesisPeer } from "./buildPrompt";

export interface SynthesisGroup {
  promptId: string;
  repeatIndex: number;
  promptText: string;
  candidates: SynthesisPeer[];
  peerRankOrder?: string[];
}

export interface SynthesisRunSummary {
  ok: number;
  errored: number;
  skipped: number;
}

function parseModelIds(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Aggregate deanonymized peer rankings for a (prompt, repeat) into one best-first
 * order by first-place votes, then by appearance order. Empty if no ok ranks.
 */
export function peerRankOrderFromRankings(rankings: string[][]): string[] | undefined {
  if (rankings.length === 0) return undefined;
  const borda = new Map<string, number>();
  for (const ranking of rankings) {
    const n = ranking.length;
    ranking.forEach((id, i) => {
      borda.set(id, (borda.get(id) ?? 0) + (n - i));
    });
  }
  const ids = [...new Set(rankings.flat())];
  ids.sort((a, b) => {
    const d = (borda.get(b) ?? 0) - (borda.get(a) ?? 0);
    if (d !== 0) return d;
    return a.localeCompare(b);
  });
  return ids;
}

export function groupsFromBatch(
  db: Database,
  runBatchId: string,
  promptTextById: Map<string, string>,
): SynthesisGroup[] {
  const runs = getRunsForBatch(db, runBatchId).filter(
    (run) => run.status === "ok" && (run.kind ?? "prompt") === "prompt" && run.outputText,
  );
  const ranks = getPeerRanksForBatch(db, runBatchId);

  const grouped = new Map<string, typeof runs>();
  for (const run of runs) {
    const key = `${run.promptId}\0${run.repeatIndex ?? 0}`;
    const list = grouped.get(key) ?? [];
    list.push(run);
    grouped.set(key, list);
  }

  const ranksByGroup = new Map<string, string[][]>();
  for (const row of ranks) {
    if (row.status !== "ok") continue;
    const order = parseModelIds(row.rankingModelIds);
    if (!order) continue;
    const key = `${row.promptId}\0${row.repeatIndex}`;
    const list = ranksByGroup.get(key) ?? [];
    list.push(order);
    ranksByGroup.set(key, list);
  }

  const groups: SynthesisGroup[] = [];
  for (const [key, groupRuns] of grouped) {
    const [promptId, repeatRaw] = key.split("\0");
    const repeatIndex = Number(repeatRaw);
    const byModel = new Map<string, SynthesisPeer>();
    for (const run of groupRuns) {
      if (!byModel.has(run.modelId)) {
        byModel.set(run.modelId, { modelId: run.modelId, outputText: run.outputText! });
      }
    }
    const promptText = promptTextById.get(promptId!) ?? "";
    groups.push({
      promptId: promptId!,
      repeatIndex,
      promptText,
      candidates: [...byModel.values()],
      peerRankOrder: peerRankOrderFromRankings(ranksByGroup.get(key) ?? []),
    });
  }

  groups.sort((a, b) => {
    const p = a.promptId.localeCompare(b.promptId);
    if (p !== 0) return p;
    return a.repeatIndex - b.repeatIndex;
  });
  return groups;
}

export async function runSynthesisForGroups(
  db: Database,
  runBatchId: string,
  groups: SynthesisGroup[],
  chairman: Chairman,
  defaultConcurrency: number,
): Promise<SynthesisRunSummary> {
  const limiter = createLimiter(chairman.maxConcurrent ?? defaultConcurrency);
  let ok = 0;
  let errored = 0;
  let skipped = 0;

  const tasks: Promise<void>[] = [];
  for (const group of groups) {
    if (group.candidates.length < 2) {
      skipped++;
      continue;
    }
    if (!group.promptText.trim()) {
      console.warn(
        `[warn] synthesize: no on-disk prompt text for ${group.promptId}; chairman will see an empty original task`,
      );
    }
    tasks.push(
      limiter(async () => {
        const result = await runOneSynthesis(
          chairman,
          group.promptText,
          group.candidates,
          group.peerRankOrder,
        );
        insertSynthesis(db, {
          runBatchId,
          promptId: group.promptId,
          repeatIndex: group.repeatIndex,
          chairmanModelId: result.chairmanModelId,
          synthesisText: result.status === "ok" ? result.synthesisText : undefined,
          provenance: provenanceJson(result),
          rawOutput: result.rawOutput || undefined,
          latencyMs: result.latencyMs,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: result.costUsd,
          status: result.status,
          error: result.status === "error" ? result.error : undefined,
          synthesizedAt: new Date().toISOString(),
        });
        if (result.status === "ok") {
          ok++;
          console.log(
            `[synthesize] ${group.promptId} chairman ${result.chairmanModelId} ` +
              `(from ${result.usedModelIds.join(", ") || "unspecified"})`,
          );
        } else {
          errored++;
          console.log(`[synthesize-error] ${group.promptId}: ${result.error}`);
        }
      }),
    );
  }

  if (tasks.length > 0) {
    console.warn(
      `[warn] synthesize: about to run ${tasks.length} chairman call(s) ` +
        `(one large-context synthesis per prompt/repeat with ≥2 ok candidates). ` +
        "This is answer production, not a leaderboard score.",
    );
    await Promise.all(tasks);
  }

  return { ok, errored, skipped };
}
