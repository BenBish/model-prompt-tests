import { midranks } from "./stats";

export interface HumanGroupLabel {
  promptId: string;
  repeatIndex: number;
  /** Best-first model ids. Rank 1 = first entry. */
  ranking?: string[];
  /** Higher is better. Converted to midranks when ranking is absent. */
  scores?: Record<string, number>;
}

export interface HumanLabelsFile {
  groups: HumanGroupLabel[];
}

export function humanLabelKey(promptId: string, repeatIndex: number): string {
  return `${promptId}\0${repeatIndex}`;
}

/**
 * 1-based ranks (lower = better) keyed by model id.
 * Ranking lists win over scores when both are present.
 */
export function humanRanksForGroup(group: HumanGroupLabel): Map<string, number> {
  const ranks = new Map<string, number>();
  if (group.ranking && group.ranking.length > 0) {
    const seen = new Set<string>();
    for (let i = 0; i < group.ranking.length; i++) {
      const modelId = group.ranking[i]!;
      if (seen.has(modelId)) {
        throw new Error(
          `human labels: duplicate model "${modelId}" in ranking for ${group.promptId} repeat ${group.repeatIndex}`,
        );
      }
      seen.add(modelId);
      ranks.set(modelId, i + 1);
    }
    return ranks;
  }
  if (group.scores && Object.keys(group.scores).length > 0) {
    const entries = Object.entries(group.scores);
    const values = entries.map(([, score]) => score);
    const scoreRanks = midranks(values, "higher");
    entries.forEach(([modelId], i) => {
      ranks.set(modelId, scoreRanks[i]!);
    });
    return ranks;
  }
  return ranks;
}

export function parseHumanLabels(raw: unknown, sourcePath: string): Map<string, HumanGroupLabel> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`human labels (${sourcePath}): expected an object with a "groups" array`);
  }
  const groups = (raw as { groups?: unknown }).groups;
  if (!Array.isArray(groups)) {
    throw new Error(`human labels (${sourcePath}): missing "groups" array`);
  }

  const byKey = new Map<string, HumanGroupLabel>();
  for (const [index, entry] of groups.entries()) {
    const label = parseGroup(entry, sourcePath, index);
    const key = humanLabelKey(label.promptId, label.repeatIndex);
    if (byKey.has(key)) {
      throw new Error(
        `human labels (${sourcePath}): duplicate group ${label.promptId} repeat ${label.repeatIndex}`,
      );
    }
    byKey.set(key, label);
  }
  return byKey;
}

function parseGroup(entry: unknown, sourcePath: string, index: number): HumanGroupLabel {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`human labels (${sourcePath}): groups[${index}] must be an object`);
  }
  const rec = entry as Record<string, unknown>;
  if (typeof rec.promptId !== "string" || rec.promptId.trim() === "") {
    throw new Error(`human labels (${sourcePath}): groups[${index}].promptId must be a non-empty string`);
  }
  const repeatIndex = rec.repeatIndex === undefined ? 0 : rec.repeatIndex;
  if (typeof repeatIndex !== "number" || !Number.isInteger(repeatIndex) || repeatIndex < 0) {
    throw new Error(`human labels (${sourcePath}): groups[${index}].repeatIndex must be a non-negative integer`);
  }

  let ranking: string[] | undefined;
  if (rec.ranking !== undefined) {
    if (!Array.isArray(rec.ranking) || !rec.ranking.every((id) => typeof id === "string" && id.length > 0)) {
      throw new Error(`human labels (${sourcePath}): groups[${index}].ranking must be a string array`);
    }
    ranking = rec.ranking as string[];
  }

  let scores: Record<string, number> | undefined;
  if (rec.scores !== undefined) {
    if (rec.scores === null || typeof rec.scores !== "object" || Array.isArray(rec.scores)) {
      throw new Error(`human labels (${sourcePath}): groups[${index}].scores must be an object of numbers`);
    }
    scores = {};
    for (const [modelId, score] of Object.entries(rec.scores as Record<string, unknown>)) {
      if (typeof score !== "number" || !Number.isFinite(score)) {
        throw new Error(`human labels (${sourcePath}): groups[${index}].scores["${modelId}"] must be a number`);
      }
      scores[modelId] = score;
    }
  }

  if (!ranking && !scores) {
    throw new Error(
      `human labels (${sourcePath}): groups[${index}] needs "ranking" (best-first) or "scores" (higher=better)`,
    );
  }

  return { promptId: rec.promptId, repeatIndex, ranking, scores };
}

export async function loadHumanLabels(path: string): Promise<Map<string, HumanGroupLabel>> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`human labels file not found: ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error(`human labels (${path}): invalid JSON`);
  }
  return parseHumanLabels(parsed, path);
}
