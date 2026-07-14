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
  writeFileSync(
    join(root, "test-prompt.md"),
    `# Test Prompt

## Prompt

\`\`\`text
Answer briefly.
\`\`\`

## What This Tests

- Basic behavior.

## Strong Answer Signals

- Clear answer.

## Weak Answer Signals

- Missing answer.

## Scoring Rubric

- \`5\`: Excellent.
- \`4\`: Good.
- \`3\`: Adequate.
- \`2\`: Weak.
- \`1\`: Poor.
`,
  );
  return root;
}

function createBenchDb(repoRoot: string): void {
  const db = new Database(join(repoRoot, "bench", "data", "bench.sqlite"));
  db.exec(readFileSync(new URL("./db/schema.sql", import.meta.url), "utf8"));
  db.close();
}

function seedBatch(repoRoot: string, runBatchId: string, startedAt: string, score: number): void {
  const db = new Database(join(repoRoot, "bench", "data", "bench.sqlite"));
  db.exec(readFileSync(new URL("./db/schema.sql", import.meta.url), "utf8"));
  db.prepare(
    `INSERT INTO runs (run_batch_id, prompt_id, provider_id, model_id, model_name, started_at, status, output_text)
     VALUES ($runBatchId, 'test-prompt', 'local', 'local:test', 'test-model', $startedAt, 'ok', 'output')`,
  ).run({ $runBatchId: runBatchId, $startedAt: startedAt });
  const runId = db.query("SELECT id FROM runs WHERE run_batch_id = $b").get({ $b: runBatchId }) as { id: number };
  db.prepare(
    `INSERT INTO scores (run_id, judge_model_id, score, rationale, scored_at, status)
     VALUES ($runId, 'local:judge', $score, 'good', $startedAt, 'ok')`,
  ).run({ $runId: runId.id, $score: score, $startedAt: startedAt });
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

  test("rejects duplicate judge ids", () => {
    const repoRoot = makeTempRepo();

    const result = runCli(repoRoot, [
      "run",
      "test-prompt",
      "--models",
      "local:test",
      "--judges",
      "local:test,local:test",
      "--dry-run",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("duplicate judge model id: local:test");
  });
});

describe("bench export CLI", () => {
  test("exports a batch by --batch id", () => {
    const repoRoot = makeTempRepo();
    seedBatch(repoRoot, "batch-1", "2026-07-14T00:00:00.000Z", 4);

    const result = runCli(repoRoot, ["export", "--name", "my-export", "--batch", "batch-1"]);

    expect(result.exitCode).toBe(0);
    const outDir = join(repoRoot, "benchmark-results", "my-export");
    expect(readFileSync(join(outDir, "report.html"), "utf8")).toContain("<!doctype html>");
    const summary = JSON.parse(readFileSync(join(outDir, "summary.json"), "utf8"));
    expect(summary[0].modelId).toBe("local:test");
    expect(summary[0].avgScore).toBe(4);
  });

  test("--latest resolves the most recent batch without an explicit --batch", () => {
    const repoRoot = makeTempRepo();
    seedBatch(repoRoot, "batch-old", "2026-07-13T00:00:00.000Z", 2);
    seedBatch(repoRoot, "batch-new", "2026-07-14T00:00:00.000Z", 5);

    const result = runCli(repoRoot, ["export", "--name", "latest-export", "--latest"]);

    expect(result.exitCode).toBe(0);
    const summary = JSON.parse(
      readFileSync(join(repoRoot, "benchmark-results", "latest-export", "summary.json"), "utf8"),
    );
    expect(summary[0].avgScore).toBe(5);
  });

  test("rejects --batch and --latest together", () => {
    const repoRoot = makeTempRepo();
    seedBatch(repoRoot, "batch-1", "2026-07-14T00:00:00.000Z", 4);

    const result = runCli(repoRoot, ["export", "--name", "x", "--batch", "batch-1", "--latest"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("use either --batch or --latest");
  });

  test("requires --batch or --latest when the flag is omitted", () => {
    const repoRoot = makeTempRepo();
    createBenchDb(repoRoot);

    const result = runCli(repoRoot, ["export", "--name", "x"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("missing --batch");
  });
});

describe("bench publish CLI", () => {
  test("publishes an exported batch to --out", () => {
    const repoRoot = makeTempRepo();
    seedBatch(repoRoot, "batch-1", "2026-07-14T00:00:00.000Z", 4);
    expect(runCli(repoRoot, ["export", "--name", "pub-test", "--batch", "batch-1"]).exitCode).toBe(0);

    const result = runCli(repoRoot, ["publish"]);

    expect(result.exitCode).toBe(0);
    const index = readFileSync(join(repoRoot, "docs", "index.html"), "utf8");
    expect(index).toContain("pub-test");
    expect(readFileSync(join(repoRoot, "docs", "runs", "pub-test", "index.html"), "utf8")).toContain(
      'property="og:title"',
    );
  });
});

describe("bench report --compare CLI", () => {
  test("renders a delta page comparing two batches", () => {
    const repoRoot = makeTempRepo();
    seedBatch(repoRoot, "batch-a", "2026-07-13T00:00:00.000Z", 2);
    seedBatch(repoRoot, "batch-b", "2026-07-14T00:00:00.000Z", 5);
    const outPath = join(repoRoot, "compare.html");

    const result = runCli(repoRoot, ["report", "--compare", "batch-a", "--compare", "batch-b", "--out", outPath]);

    expect(result.exitCode).toBe(0);
    const html = readFileSync(outPath, "utf8");
    expect(html).toContain("Compare:");
    expect(html).toContain("+3.00");
  });

  test("rejects --compare with only one value", () => {
    const repoRoot = makeTempRepo();
    seedBatch(repoRoot, "batch-a", "2026-07-13T00:00:00.000Z", 2);

    const result = runCli(repoRoot, ["report", "--compare", "batch-a"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("--compare requires exactly two batch ids");
  });
});
