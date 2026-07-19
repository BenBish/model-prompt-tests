import { findModel, type BenchModelsConfig } from "./modelConfig";
import type { ModelMatrixEntry } from "../providers/types";
import { findDuplicate } from "../util/cliArgs";

export function resolveJudge(config: BenchModelsConfig, judgeFlag: string | undefined): ModelMatrixEntry {
  const judgeId = judgeFlag ?? process.env.BENCH_JUDGE_MODEL_ID ?? config.judge.modelId;
  const found = findModel(config, judgeId);
  if (!found) {
    throw new Error(`unknown judge model id: ${judgeId}`);
  }
  return found;
}

export function resolveJudges(
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
  const duplicate = findDuplicate(ids);
  if (duplicate) {
    throw new Error(`duplicate judge model id: ${duplicate}`);
  }
  return ids.map((id) => {
    const found = findModel(config, id);
    if (!found) {
      throw new Error(`unknown judge model id: ${id}`);
    }
    return found;
  });
}
