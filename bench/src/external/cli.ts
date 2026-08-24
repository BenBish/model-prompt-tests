import { resolve } from "node:path";
import { loadExternalAdapters, MissingExternalDependencyError } from "./adapter";
import type { ExternalEcosystem } from "./types";

function required(values: Record<string, unknown>, key: string): string {
  const value = values[key];
  if (typeof value !== "string" || !value) throw new Error(`missing required --${key}`);
  return value;
}

export async function cmdExternal(repoRoot: string, subcommand: string | undefined, values: Record<string, unknown>): Promise<void> {
  const configPath = resolve(repoRoot, typeof values.config === "string" ? values.config : "bench/external-adapters.json");
  const adapters = await loadExternalAdapters(configPath, repoRoot);
  if (subcommand === "list") {
    for (const adapter of Object.values(adapters)) for (const task of adapter.discover()) console.log(`${adapter.ecosystem}\t${task.id}\t${task.datasetVersion}\t${task.runnerVersion}`);
    return;
  }
  const ecosystem = required(values, "ecosystem") as ExternalEcosystem;
  const adapter = adapters[ecosystem];
  if (!adapter) throw new Error(`unknown ecosystem: ${ecosystem}`);
  const plan = adapter.plan(required(values, "task"), required(values, "model"));
  if (subcommand === "plan") { console.log(JSON.stringify(plan, null, 2)); return; }
  if (subcommand === "run") {
    try { console.log(JSON.stringify(await adapter.execute(plan, resolve(repoRoot, required(values, "out"))), null, 2)); }
    catch (error) { if (error instanceof MissingExternalDependencyError) console.error(JSON.stringify({ kind: "missing-dependency", ecosystem: error.ecosystem, executable: error.executable })); throw error; }
    return;
  }
  throw new Error("Usage: external <list|plan|run>");
}
