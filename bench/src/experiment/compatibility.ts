import type { ExperimentManifest } from "./manifest";
import { canonicalJson } from "./manifest";
export interface CompatibilityDifference { path: string; before: unknown; after: unknown; category: "semantic" | "environment" }
export interface CompatibilityResult { compatible: boolean; performanceComparable: boolean; comparableMetricFamilies: string[]; differences: CompatibilityDifference[] }
function compare(path: string, a: unknown, b: unknown, category: CompatibilityDifference["category"], out: CompatibilityDifference[]): void { if (canonicalJson(a) !== canonicalJson(b)) out.push({ path, before: a, after: b, category }); }
export function compareExperiments(a: ExperimentManifest, b: ExperimentManifest): CompatibilityResult {
  const differences: CompatibilityDifference[] = [];
  for (const path of ["suite", "tasks", "models", "judges", "harness", "prompts", "limits", "toolPermissions"] as const) compare(path, a[path], b[path], "semantic", differences);
  compare("environment", a.environment, b.environment, "environment", differences);
  const compatible = !differences.some((d) => d.category === "semantic");
  const performanceComparable = compatible && !differences.some((d) => d.category === "environment");
  return { compatible, performanceComparable, comparableMetricFamilies: compatible ? (performanceComparable ? ["quality", "correctness", "latency", "throughput", "memory", "energy", "stability"] : ["quality", "correctness"]) : [], differences };
}
