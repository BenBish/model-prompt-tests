import { existsSync } from "node:fs";

export type FindingSeverity = "high" | "med" | "low";

export const SEVERITY_WEIGHT: Record<FindingSeverity, number> = {
  high: 3,
  med: 2,
  low: 1,
};

export interface GroundTruthFinding {
  id: string;
  severity: FindingSeverity;
  summary: string;
  locations?: string[];
  matchHints?: string[];
}

export interface RedHerring {
  summary: string;
  /** Optional note for authors; not shown to the agent. */
  note?: string;
}

export interface FindingsSpec {
  findings: GroundTruthFinding[];
  redHerrings: RedHerring[];
}

const SEVERITIES = new Set<FindingSeverity>(["high", "med", "low"]);

export function parseFindingsJson(raw: unknown, sourcePath: string): FindingsSpec {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${sourcePath}: findings.json must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.findings) || obj.findings.length === 0) {
    throw new Error(`${sourcePath}: "findings" must be a non-empty array`);
  }

  const findings: GroundTruthFinding[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < obj.findings.length; i++) {
    const item = obj.findings[i];
    const ctx = `${sourcePath}: findings[${i}]`;
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`${ctx}: must be an object`);
    }
    const f = item as Record<string, unknown>;
    const id = f.id;
    const severity = f.severity;
    const summary = f.summary;
    if (typeof id !== "string" || id.trim() === "") {
      throw new Error(`${ctx}: missing non-empty string "id"`);
    }
    if (ids.has(id)) throw new Error(`${ctx}: duplicate finding id "${id}"`);
    ids.add(id);
    if (typeof severity !== "string" || !SEVERITIES.has(severity as FindingSeverity)) {
      throw new Error(`${ctx}: "severity" must be one of high, med, low`);
    }
    if (typeof summary !== "string" || summary.trim() === "") {
      throw new Error(`${ctx}: missing non-empty string "summary"`);
    }
    const locations = optionalStringArray(f.locations, `${ctx}.locations`);
    const matchHints = optionalStringArray(f.matchHints, `${ctx}.matchHints`);
    findings.push({
      id,
      severity: severity as FindingSeverity,
      summary,
      locations,
      matchHints,
    });
  }

  let redHerrings: RedHerring[] = [];
  if (obj.redHerrings !== undefined) {
    if (!Array.isArray(obj.redHerrings)) {
      throw new Error(`${sourcePath}: "redHerrings" must be an array when present`);
    }
    redHerrings = obj.redHerrings.map((item, i) => {
      const ctx = `${sourcePath}: redHerrings[${i}]`;
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        throw new Error(`${ctx}: must be an object`);
      }
      const r = item as Record<string, unknown>;
      if (typeof r.summary !== "string" || r.summary.trim() === "") {
        throw new Error(`${ctx}: missing non-empty string "summary"`);
      }
      if (r.note !== undefined && typeof r.note !== "string") {
        throw new Error(`${ctx}: "note" must be a string when present`);
      }
      return { summary: r.summary, note: typeof r.note === "string" ? r.note : undefined };
    });
  }

  return { findings, redHerrings };
}

function optionalStringArray(value: unknown, ctx: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${ctx}: must be an array of strings`);
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== "string") throw new Error(`${ctx}[${i}]: must be a string`);
  }
  return value as string[];
}

export async function loadFindingsSpec(findingsPath: string): Promise<FindingsSpec> {
  if (!existsSync(findingsPath)) {
    throw new Error(`findings file not found: ${findingsPath}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await Bun.file(findingsPath).text());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${findingsPath}: invalid JSON: ${message}`);
  }
  return parseFindingsJson(raw, findingsPath);
}

export interface MatchRecord {
  findingId: string;
  matched: boolean;
  evidenceQuote?: string;
}

export interface ExtraFindingRecord {
  summary: string;
  /** true = plausible extra bug, false = incorrect / red herring */
  verdict: "plausible" | "incorrect";
}

export interface ReviewMatcherResult {
  matches: MatchRecord[];
  extraFindings: ExtraFindingRecord[];
}

export interface ReviewMetrics {
  /** Severity-weighted recall in [0, 1]. */
  recall: number;
  /** Precision over claimed matches + extraFindings marked plausible. */
  precision: number;
  f1: number;
  truePositives: number;
  falseNegatives: number;
  falsePositives: number;
  /** Weight sum of ground-truth findings. */
  totalWeight: number;
  /** Weight sum of matched findings. */
  matchedWeight: number;
  findingIdsMatched: string[];
  findingIdsMissed: string[];
  matcherModelId?: string;
  raw?: unknown;
}

/**
 * Compute severity-weighted recall/precision/F1 from matcher output + ground truth.
 * - TP weight = sum of severities for ground-truth findings with matched=true
 * - FN weight = total weight - TP weight
 * - FP count = matched=true for unknown ids + extraFindings with verdict "plausible"
 *   (incorrect extras do not count as FP — they are correctly rejected noise)
 * Precision = TP_count / (TP_count + FP_count) using unweighted counts for claimed hits,
 * with severity-weighted recall as specified in the plan.
 */
export function computeReviewMetrics(
  groundTruth: GroundTruthFinding[],
  matcher: ReviewMatcherResult,
  matcherModelId?: string,
): ReviewMetrics {
  const byId = new Map(groundTruth.map((f) => [f.id, f]));
  const totalWeight = groundTruth.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);

  const matchedIds = new Set<string>();
  let unknownMatchedClaims = 0;
  for (const m of matcher.matches) {
    if (!m.matched) continue;
    if (byId.has(m.findingId)) matchedIds.add(m.findingId);
    else unknownMatchedClaims++;
  }

  const matchedWeight = [...matchedIds].reduce((sum, id) => {
    const f = byId.get(id)!;
    return sum + SEVERITY_WEIGHT[f.severity];
  }, 0);

  const truePositives = matchedIds.size;
  const falseNegatives = groundTruth.length - truePositives;
  const plausibleExtras = matcher.extraFindings.filter((e) => e.verdict === "plausible").length;
  const falsePositives = unknownMatchedClaims + plausibleExtras;

  const recall = totalWeight > 0 ? matchedWeight / totalWeight : 0;
  const claimed = truePositives + falsePositives;
  const precision = claimed > 0 ? truePositives / claimed : truePositives === 0 ? 1 : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  const findingIdsMatched = [...matchedIds].sort();
  const findingIdsMissed = groundTruth.map((f) => f.id).filter((id) => !matchedIds.has(id));

  return {
    recall,
    precision,
    f1,
    truePositives,
    falseNegatives,
    falsePositives,
    totalWeight,
    matchedWeight,
    findingIdsMatched,
    findingIdsMissed,
    matcherModelId,
    raw: matcher,
  };
}
