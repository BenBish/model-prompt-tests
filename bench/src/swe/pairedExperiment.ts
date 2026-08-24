import type { HarnessMatrixEntry, SystemUnderTestIdentity } from "./harnessConfig";

export type ComparisonKind = "harness-effect" | "agent-system";
export interface PairedCellIdentity { harnessId: string; modelAlias: string; identity: SystemUnderTestIdentity }
export interface PairedExperimentPlan { kind: ComparisonKind; underlyingModel: string; cells: PairedCellIdentity[]; exclusions: string[] }

function immutableKey(identity: SystemUnderTestIdentity): string | undefined {
  const revision = identity.weightsSha256 ?? identity.immutableRevision;
  return revision ? `${identity.underlyingModel}\0${revision}\0${identity.provider}\0${identity.backend}\0${identity.quantization ?? ""}` : undefined;
}

export function validatePairedExperiment(entries: HarnessMatrixEntry[], aliases: string[], repeats: number): PairedExperimentPlan {
  if (entries.length < 2) throw new Error("paired experiment requires at least two harnesses");
  if (!entries.some((entry) => entry.kind === "raw-api") || !entries.some((entry) => entry.kind !== "raw-api")) throw new Error("paired experiment requires raw-api and at least one agent-loop harness");
  if (aliases.length !== 1) throw new Error("paired experiment requires exactly one unambiguous model alias");
  if (repeats < 3 || repeats > 5) throw new Error("paired experiment requires 3–5 repeats per task/harness cell");
  const alias = aliases[0]!;
  const cells = entries.map((entry) => {
    const identity = entry.systemUnderTest?.[alias];
    if (!identity) throw new Error(`paired experiment identity missing for ${entry.id}:${alias} (set systemUnderTest.${alias})`);
    if (!identity.weightsSha256 && !identity.immutableRevision) throw new Error(`paired experiment identity ${entry.id}:${alias} needs weightsSha256 or immutableRevision`);
    return { harnessId: entry.id, modelAlias: alias, identity };
  });
  const keys = new Set(cells.map((cell) => immutableKey(cell.identity)));
  const nonHermetic = cells.filter((cell) => cell.identity.hermetic !== true).map((cell) => `${cell.harnessId}:${alias}`);
  const exclusions: string[] = [];
  if (keys.size !== 1) exclusions.push("underlying model/provider/backend identity differs across cells");
  if (nonHermetic.length) exclusions.push(`non-hermetic cells: ${nonHermetic.join(", ")}`);
  return { kind: exclusions.length ? "agent-system" : "harness-effect", underlyingModel: cells[0]!.identity.underlyingModel, cells, exclusions };
}
