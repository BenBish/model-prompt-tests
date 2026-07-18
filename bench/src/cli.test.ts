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

  test("reflects --repeats in the dry-run summary", () => {
    const repoRoot = makeTempRepo();

    const result = runCli(repoRoot, [
      "run",
      "test-prompt",
      "--models",
      "local:test",
      "--repeats",
      "3",
      "--dry-run",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("x 3 repeat(s)");
  });

  test("rejects a non-positive --repeats value", () => {
    const repoRoot = makeTempRepo();

    const result = runCli(repoRoot, [
      "run",
      "test-prompt",
      "--models",
      "local:test",
      "--repeats",
      "0",
      "--dry-run",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("--repeats must be a positive integer");
  });

  test("--narrative failure still writes the deterministic report, summary, and assessment", () => {
    const repoRoot = makeTempRepo();
    createBenchDb(repoRoot);

    // models.example.json points local:test at http://localhost:8000/v1, which nothing is
    // listening on in this test, so the narrative call is guaranteed to fail — proving the
    // report/summary/assessment outputs survive an optional narrative failure.
    const outPath = join(repoRoot, "bench", "reports", "narrative-report.html");
    const result = runCli(repoRoot, ["report", "--out", outPath, "--narrative", "--judge", "local:test"]);

    expect(result.exitCode).toBe(0);
    expect(readFileSync(outPath, "utf8")).toContain("<!doctype html>");
    expect(JSON.parse(readFileSync(`${outPath.replace(/\.html$/, ".summary.json")}`, "utf8"))).toEqual([]);
    const assessment = readFileSync(outPath.replace(/\.html$/, ".assessment.md"), "utf8");
    expect(assessment).toContain("# Bench Assessment");
    expect(assessment).toContain("Narrative generation failed");
  });
});
