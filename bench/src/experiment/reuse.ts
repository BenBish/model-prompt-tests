import type { Database } from "bun:sqlite";
import { getExperiment } from "../db/experimentsRepo";
import { compareExperiments } from "./compatibility";
import type { ExperimentManifest } from "./manifest";

export function resolveReusableExperiment(
  db: Database,
  experimentId: string,
  proposed: ExperimentManifest,
  normalizeForComparison?: (
    proposed: ExperimentManifest,
    frozen: ExperimentManifest,
  ) => ExperimentManifest,
): ExperimentManifest {
  const stored = getExperiment(db, experimentId);
  if (!stored) throw new Error(`unknown experiment id "${experimentId}"`);

  const storedTasks = new Map(stored.manifest.tasks.map((task) => [task.id, task.sha256]));
  const extras = proposed.tasks.filter((task) => storedTasks.get(task.id) !== task.sha256);
  if (extras.length > 0) {
    throw new Error(
      `cannot reuse experiment "${experimentId}": task(s) absent from the frozen manifest or changed: ${extras.map((task) => task.id).join(", ")}`,
    );
  }

  const comparable = normalizeForComparison?.(proposed, stored.manifest) ?? proposed;
  const comparison = compareExperiments(stored.manifest, {
    ...comparable,
    tasks: stored.manifest.tasks,
  });
  const semanticPaths = comparison.differences
    .filter((difference) => difference.category === "semantic")
    .map((difference) => difference.path);
  if (semanticPaths.length > 0) {
    throw new Error(
      `cannot reuse experiment "${experimentId}": incompatible experiment manifest at ${semanticPaths.join(", ")}`,
    );
  }

  return stored.manifest;
}
