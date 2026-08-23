import { createHash } from "node:crypto";

export type CalibrationCategory = "instruction-following" | "coding-debugging" | "safety" | "code-review";
export type CalibrationStatus = "calibrated" | "stale" | "failed" | "uncalibrated";

export interface AnchorResponse {
  id: string;
  category: CalibrationCategory;
  taskId: string;
  quality: 1 | 3 | 5;
  response: string;
  style: { words: number; headings: number; bullets: number; codeBlocks: number };
}
export interface AnchorCorpus {
  schemaVersion: 1;
  version: string;
  blinded: true;
  anchors: AnchorResponse[];
}

export interface AnchorJudgment {
  anchorId: string;
  judgeId: string;
  judgeFamily: string;
  candidateFamily?: string;
  score: 1 | 2 | 3 | 4 | 5;
  dimensions?: Record<string, number>;
}

export interface PairwiseJudgment {
  pairId: string;
  judgeId: string;
  firstAnchorId: string;
  secondAnchorId: string;
  winner: "first" | "second" | "tie";
}

export interface CalibrationEvidence {
  schemaVersion: 1;
  runDate: string;
  corpusVersion: string;
  experimentId: string;
  manifest: {
    judgeRoster: Array<{ id: string; provider: string; model: string; immutableRevision: string }>;
    graderPromptSha256: string;
    rubricSha256: string;
    panelComposition: string[];
  };
  humanLabels: Array<{ anchorId: string; label: 1 | 2 | 3 | 4 | 5; category: CalibrationCategory }>;
  judgments: AnchorJudgment[];
  pairwise: PairwiseJudgment[];
}

export interface CalibrationPolicy {
  minimumHumanLabels: number;
  minimumCategoryCoverage: number;
  maxAgeDays: number;
  maxExtremeConcentration: number;
  maxJudgeStdDev: number;
  maxPositionEffect: number;
}

export interface CategoryCalibration {
  category: CalibrationCategory;
  samples: number;
  exactAgreement: number;
  withinOneAgreement: number;
  confusion: Record<string, number>;
}

export interface CalibrationAssessment {
  status: CalibrationStatus;
  publicationEligible: boolean;
  corpusSha256: string;
  evidenceSha256?: string;
  failures: string[];
  warnings: string[];
  monotonicityFailures: string[];
  extremeConcentration: number;
  judgeDisagreement: number;
  positionEffect: number;
  ties: number;
  humanCoverage: number;
  categories: CategoryCalibration[];
  judgeFamilyBias: Record<string, number>;
  styleCorrelations: Record<string, number | null>;
}

export const DEFAULT_CALIBRATION_POLICY: CalibrationPolicy = {
  minimumHumanLabels: 12,
  minimumCategoryCoverage: 3,
  maxAgeDays: 90,
  maxExtremeConcentration: 0.75,
  maxJudgeStdDev: 1.25,
  maxPositionEffect: 0.15,
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

function hash(value: unknown): string { return createHash("sha256").update(canonical(value)).digest("hex"); }
function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function stddev(xs: number[]): number { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); }
function correlation(xs: number[], ys: number[]): number | null {
  if (xs.length < 2 || xs.length !== ys.length) return null;
  const mx = mean(xs), my = mean(ys);
  const numerator = xs.reduce((sum, x, i) => sum + (x - mx) * (ys[i]! - my), 0);
  const denominator = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
  return denominator === 0 ? null : numerator / denominator;
}

export function validateCorpus(corpus: AnchorCorpus): void {
  if (corpus.schemaVersion !== 1 || corpus.blinded !== true) throw new Error("anchor corpus must be schemaVersion 1 and blinded");
  const required: CalibrationCategory[] = ["instruction-following", "coding-debugging", "safety", "code-review"];
  for (const category of required) {
    for (const quality of [1, 3, 5] as const) {
      if (!corpus.anchors.some((a) => a.category === category && a.quality === quality)) throw new Error(`missing ${category} quality-${quality} anchor`);
    }
  }
  const ids = corpus.anchors.map((a) => a.id);
  if (new Set(ids).size !== ids.length) throw new Error("anchor ids must be unique");
}

export function analyzeAnchors(corpus: AnchorCorpus, evidence: CalibrationEvidence | undefined, now = new Date(), policy = DEFAULT_CALIBRATION_POLICY): CalibrationAssessment {
  validateCorpus(corpus);
  const base = { corpusSha256: hash(corpus), failures: [] as string[], warnings: [] as string[] };
  if (!evidence) return { ...base, status: "uncalibrated", publicationEligible: false, monotonicityFailures: [], extremeConcentration: 0, judgeDisagreement: 0, positionEffect: 0, ties: 0, humanCoverage: 0, categories: [], judgeFamilyBias: {}, styleCorrelations: {} };
  const failures = base.failures;
  const warnings = base.warnings;
  if (evidence.corpusVersion !== corpus.version) failures.push(`evidence corpus ${evidence.corpusVersion} does not match ${corpus.version}`);
  if (!evidence.experimentId.startsWith("exp_")) failures.push("evidence is not bound to an immutable experiment manifest");
  if (!evidence.manifest.judgeRoster.length || evidence.manifest.judgeRoster.some((j) => !j.immutableRevision)) failures.push("judge roster has mutable or missing revisions");
  if (!/^[a-f0-9]{64}$/.test(evidence.manifest.graderPromptSha256) || !/^[a-f0-9]{64}$/.test(evidence.manifest.rubricSha256)) failures.push("grader prompt or rubric hash is invalid");
  const ageDays = (now.getTime() - new Date(evidence.runDate).getTime()) / 86_400_000;
  if (ageDays > policy.maxAgeDays) warnings.push(`calibration is stale (${Math.floor(ageDays)} days old; maximum ${policy.maxAgeDays})`);

  const byAnchor = new Map(corpus.anchors.map((a) => [a.id, a]));
  const labels = new Map(evidence.humanLabels.map((h) => [h.anchorId, h]));
  const coverage = evidence.humanLabels.length / corpus.anchors.length;
  if (evidence.humanLabels.length < policy.minimumHumanLabels) failures.push(`human labels ${evidence.humanLabels.length} below minimum ${policy.minimumHumanLabels}`);
  for (const category of ["instruction-following", "coding-debugging", "safety", "code-review"] as CalibrationCategory[]) {
    const count = evidence.humanLabels.filter((h) => h.category === category).length;
    if (count < policy.minimumCategoryCoverage) failures.push(`${category} human coverage ${count} below minimum ${policy.minimumCategoryCoverage}`);
  }

  const scoresByAnchor = new Map<string, number[]>();
  for (const j of evidence.judgments) scoresByAnchor.set(j.anchorId, [...(scoresByAnchor.get(j.anchorId) ?? []), j.score]);
  const monotonicityFailures: string[] = [];
  for (const category of ["instruction-following", "coding-debugging", "safety", "code-review"] as CalibrationCategory[]) {
    const averages = ([1, 3, 5] as const).map((q) => mean(corpus.anchors.filter((a) => a.category === category && a.quality === q).flatMap((a) => scoresByAnchor.get(a.id) ?? [])));
    if (!(averages[0]! < averages[1]! && averages[1]! < averages[2]!)) monotonicityFailures.push(`${category}: ${averages.map((x) => x.toFixed(2)).join(" / ")}`);
  }
  if (monotonicityFailures.length) failures.push(`${monotonicityFailures.length} anchor category/categories are not monotonic`);
  const allScores = evidence.judgments.map((j) => j.score);
  const extremeConcentration = allScores.length ? allScores.filter((s) => s === 1 || s === 5).length / allScores.length : 0;
  if (extremeConcentration > policy.maxExtremeConcentration) failures.push(`ceiling/floor concentration ${(extremeConcentration * 100).toFixed(1)}% exceeds ${(policy.maxExtremeConcentration * 100).toFixed(1)}%`);
  const disagreement = mean([...scoresByAnchor.values()].map(stddev));
  if (disagreement > policy.maxJudgeStdDev) failures.push(`judge disagreement ${disagreement.toFixed(2)} exceeds ${policy.maxJudgeStdDev}`);

  const pairGroups = new Map<string, PairwiseJudgment[]>();
  for (const p of evidence.pairwise) pairGroups.set(p.pairId, [...(pairGroups.get(p.pairId) ?? []), p]);
  let reversed = 0, comparable = 0;
  for (const rows of pairGroups.values()) if (rows.length >= 2) { comparable++; const normalized = rows.map((r) => r.winner === "tie" ? "tie" : r.winner === "first" ? r.firstAnchorId : r.secondAnchorId); if (new Set(normalized).size > 1) reversed++; }
  const positionEffect = comparable ? reversed / comparable : 0;
  if (positionEffect > policy.maxPositionEffect) failures.push(`pairwise position effect ${(positionEffect * 100).toFixed(1)}% exceeds ${(policy.maxPositionEffect * 100).toFixed(1)}%`);

  const categories = (["instruction-following", "coding-debugging", "safety", "code-review"] as CalibrationCategory[]).map((category) => {
    const rows = evidence.judgments.filter((j) => byAnchor.get(j.anchorId)?.category === category && labels.has(j.anchorId));
    const confusion: Record<string, number> = {};
    for (const row of rows) { const human = labels.get(row.anchorId)!.label; confusion[`${human}->${row.score}`] = (confusion[`${human}->${row.score}`] ?? 0) + 1; }
    return { category, samples: rows.length, exactAgreement: rows.length ? rows.filter((r) => r.score === labels.get(r.anchorId)!.label).length / rows.length : 0, withinOneAgreement: rows.length ? rows.filter((r) => Math.abs(r.score - labels.get(r.anchorId)!.label) <= 1).length / rows.length : 0, confusion };
  });
  const familyRows = new Map<string, number[]>();
  for (const row of evidence.judgments) if (row.candidateFamily) { const key = `${row.judgeFamily}->${row.candidateFamily}`; const human = labels.get(row.anchorId)?.label; if (human) familyRows.set(key, [...(familyRows.get(key) ?? []), row.score - human]); }
  const judgeFamilyBias = Object.fromEntries([...familyRows].map(([k, xs]) => [k, mean(xs)]));
  const judgedAnchors = evidence.judgments.map((j) => byAnchor.get(j.anchorId)).filter((a): a is AnchorResponse => !!a);
  const styleCorrelations = Object.fromEntries((["words", "headings", "bullets", "codeBlocks"] as const).map((key) => [key, correlation(judgedAnchors.map((a) => a.style[key]), evidence.judgments.map((j) => j.score))]));
  const status: CalibrationStatus = failures.length ? "failed" : warnings.some((w) => w.includes("stale")) ? "stale" : "calibrated";
  return { ...base, evidenceSha256: hash(evidence), failures, warnings, status, publicationEligible: status === "calibrated", monotonicityFailures, extremeConcentration, judgeDisagreement: disagreement, positionEffect, ties: evidence.pairwise.filter((p) => p.winner === "tie").length, humanCoverage: coverage, categories, judgeFamilyBias, styleCorrelations };
}

export async function loadJson<T>(path: string): Promise<T> { return JSON.parse(await Bun.file(path).text()) as T; }

export function renderAnchorReport(result: CalibrationAssessment): string {
  const categoryRows = result.categories.map((c) => `| ${c.category} | ${c.samples} | ${(c.exactAgreement * 100).toFixed(1)}% | ${(c.withinOneAgreement * 100).toFixed(1)}% | ${Object.entries(c.confusion).map(([k,v]) => `${k}:${v}`).join(", ")} |`).join("\n");
  return `# Human anchor calibration\n\n**Status: ${result.status.toUpperCase()}**  \n**Publication eligible: ${result.publicationEligible ? "yes" : "no (fail closed)"}**\n\n## Gate findings\n\n${[...result.failures, ...result.warnings].map((x) => `- ${x}`).join("\n") || "- None."}\n\n| Metric | Result |\n| --- | ---: |\n| Human coverage | ${(result.humanCoverage * 100).toFixed(1)}% |\n| Ceiling/floor concentration | ${(result.extremeConcentration * 100).toFixed(1)}% |\n| Mean judge disagreement (σ) | ${result.judgeDisagreement.toFixed(3)} |\n| Pairwise position effect | ${(result.positionEffect * 100).toFixed(1)}% |\n| Explicit ties | ${result.ties} |\n\n## Per-category agreement and confusion\n\n| Category | Judgments | Exact | Within one | Human→judge confusion |\n| --- | ---: | ---: | ---: | --- |\n${categoryRows || "| — | 0 | — | — | — |"}\n\n## Judge-family bias\n\n${Object.entries(result.judgeFamilyBias).map(([k,v]) => `- ${k}: ${v >= 0 ? "+" : ""}${v.toFixed(3)} score points vs human`).join("\n") || "- No cross-family observations."}\n\n## Style correlations\n\n${Object.entries(result.styleCorrelations).map(([k,v]) => `- ${k}: ${v === null ? "n/a" : v.toFixed(3)}`).join("\n")}\n\nPeer rank remains a secondary signal and is not blended into headline scores.\n`;
}
