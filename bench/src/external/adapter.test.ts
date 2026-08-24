import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CommandExternalAdapter, ExternalDependencyVersionError, loadExternalAdapters, MissingExternalDependencyError } from "./adapter";
import type { ExternalEcosystem, ExternalTaskDefinition } from "./types";

const root = join(import.meta.dir, "../../..");
const runner = join(import.meta.dir, "fixtures/fakeRunner.ts");

function task(ecosystem: ExternalEcosystem): ExternalTaskDefinition {
  return {
    id: `${ecosystem}/tiny`, datasetVersion: "fixture@sha256:abc", runnerVersion: `bun@${Bun.version}`,
    command: [process.execPath, runner, "--model", "{model}", "--task", "{task}", "--output", "{output}"],
    resultPattern: "**/results.json", artifactPatterns: ["**/*.log"], citation: "https://example.test/citation", license: "CC-BY-4.0",
    ...(ecosystem === "harbor" ? { isolation: { agentEnvironment: "fixture-container", verifierEnvironment: "fixture-verifier@sha256:def", verifierLocked: true } } : {}),
  };
}

describe("external benchmark adapters", () => {
  for (const ecosystem of ["inspect", "harbor", "lm-eval"] as const) {
    test(`${ecosystem} discovers, plans, and executes a pinned offline fixture`, async () => {
      const adapter = new CommandExternalAdapter(ecosystem, process.execPath, [process.execPath, "--version"], [task(ecosystem)], root);
      expect(adapter.discover()[0]?.datasetVersion).toContain("sha256:");
      const output = await mkdtemp(join(tmpdir(), `external-${ecosystem}-`));
      const plan = adapter.plan(`${ecosystem}/tiny`, "fixture:model-a");
      const result = await adapter.execute(plan, output);
      expect(result.outcome).toBe("passed");
      expect(result.native.metrics).toEqual({ accuracy: 1 });
      expect(result.artifacts).toEqual(["results.json", "runner.log"]);
      expect(result.provenance.isolation?.verifierLocked ?? true).toBe(true);
      expect(result.provenance.observedRunnerVersion).toContain(Bun.version);
      expect(JSON.parse(await readFile(join(output, "external-result.json"), "utf8")).source).toBe("external");
    });
  }

  test("cache keys include model, task version, and configuration", () => {
    const adapter = new CommandExternalAdapter("inspect", process.execPath, [process.execPath, "--version"], [task("inspect")], root);
    expect(adapter.plan("inspect/tiny", "model:a").cacheKey).not.toBe(adapter.plan("inspect/tiny", "model:b").cacheKey);
    const changed = task("inspect"); changed.datasetVersion = "fixture@sha256:different";
    expect(new CommandExternalAdapter("inspect", process.execPath, [process.execPath, "--version"], [changed], root).plan("inspect/tiny", "model:a").cacheKey).not.toBe(adapter.plan("inspect/tiny", "model:a").cacheKey);
  });

  test("missing dependencies are distinct from candidate failures", async () => {
    const adapter = new CommandExternalAdapter("lm-eval", "/definitely/missing/lm_eval", ["/definitely/missing/lm_eval", "--version"], [task("lm-eval")], root);
    const output = await mkdtemp(join(tmpdir(), "external-missing-"));
    expect(adapter.execute(adapter.plan("lm-eval/tiny", "model:a"), output)).rejects.toBeInstanceOf(MissingExternalDependencyError);
  });

  test("requires immutable pins and Harbor verifier isolation", () => {
    const unpinned = task("inspect"); unpinned.datasetVersion = "latest";
    expect(() => new CommandExternalAdapter("inspect", process.execPath, [process.execPath, "--version"], [unpinned], root).plan("inspect/tiny", "model:a")).toThrow("immutable dataset version");
    const unsafe = task("harbor"); delete unsafe.isolation;
    expect(() => new CommandExternalAdapter("harbor", process.execPath, [process.execPath, "--version"], [unsafe], root).plan("harbor/tiny", "model:a")).toThrow("locked verifier");
  });

  test("rejects an installed runner whose observed version differs from the pin", async () => {
    const wrongVersion = task("inspect"); wrongVersion.runnerVersion = "bun@0.0.0-impossible";
    const adapter = new CommandExternalAdapter("inspect", process.execPath, [process.execPath, "--version"], [wrongVersion], root);
    const output = await mkdtemp(join(tmpdir(), "external-version-"));
    expect(adapter.execute(adapter.plan("inspect/tiny", "model:a"), output)).rejects.toBeInstanceOf(ExternalDependencyVersionError);
  });

  test("validates custom catalogs before constructing adapters", async () => {
    const dir = await mkdtemp(join(tmpdir(), "external-config-"));
    const path = join(dir, "invalid.json");
    await writeFile(path, JSON.stringify({ schemaVersion: 1, ecosystems: { unexpected: { executable: "x", versionCommand: ["x"], tasks: [] } } }));
    expect(loadExternalAdapters(path, root)).rejects.toThrow("unsupported external ecosystem");
  });
});
