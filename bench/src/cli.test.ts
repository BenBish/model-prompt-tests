import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tempRoots: string[] = [];
const cliPath = new URL("./cli.ts", import.meta.url).pathname;

function makeTempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "bench-cli-"));
  tempRoots.push(root);
  mkdirSync(join(root, "bench", "data"), { recursive: true });
  mkdirSync(join(root, "bench", "reports"), { recursive: true });
  writeFileSync(
    join(root, "bench", "models.example.json"),
    `${JSON.stringify(
      {
        models: [
          {
            id: "local:test",
            kind: "openai-compatible",
            providerId: "local",
            modelName: "test-model",
            baseUrl: "http://localhost:8000/v1",
          },
        ],
        judge: { modelId: "local:test" },
      },
      null,
      2,
    )}\n`,
  );
  return root;
}

function createBenchDb(repoRoot: string): void {
  const db = new Database(join(repoRoot, "bench", "data", "bench.sqlite"));
  db.exec(readFileSync(new URL("./db/schema.sql", import.meta.url), "utf8"));
  db.close();
}

function runCli(repoRoot: string, args: string[]) {
  return Bun.spawnSync({
    cmd: ["bun", cliPath, ...args],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe("bench models CLI", () => {
  test("adds OpenAI-compatible extra headers", () => {
    const repoRoot = makeTempRepo();

    const result = runCli(repoRoot, [
      "models",
      "add-openai-compatible",
      "--id",
      "openrouter:test",
      "--provider",
      "openrouter",
      "--model",
      "provider/model",
      "--base-url",
      "https://openrouter.ai/api/v1",
      "--api-key-env",
      "OPENROUTER_API_KEY",
      "--header",
      "HTTP-Referer=https://github.com/model-prompt-tests",
      "--header",
      "X-Title=model-prompt-tests bench",
      "--reasoning-effort",
      "medium",
    ]);

    expect(result.exitCode).toBe(0);
    const saved = JSON.parse(readFileSync(join(repoRoot, "bench", "models.json"), "utf8"));
    const model = saved.models.find((entry: { id: string }) => entry.id === "openrouter:test");
    expect(model.extraHeaders).toEqual({
      "HTTP-Referer": "https://github.com/model-prompt-tests",
      "X-Title": "model-prompt-tests bench",
    });
    expect(model.reasoningEffort).toBe("medium");
  });

  test("does not overwrite report output when --out has no html suffix", () => {
    const repoRoot = makeTempRepo();
    createBenchDb(repoRoot);

    const outPath = join(repoRoot, "bench", "reports", "custom-report");
    const result = runCli(repoRoot, ["report", "--out", outPath]);

    expect(result.exitCode).toBe(0);
    expect(readFileSync(outPath, "utf8")).toContain("<!doctype html>");
    expect(JSON.parse(readFileSync(`${outPath}.summary.json`, "utf8"))).toEqual([]);
  });
});
