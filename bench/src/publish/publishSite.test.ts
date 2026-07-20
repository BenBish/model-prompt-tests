import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SitePayload } from "../export/exportBatch";
import { publishSite } from "./publishSite";

const tempRoots: string[] = [];
afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

function makeResultsDir(): string {
  const root = mkdtempSync(join(tmpdir(), "bench-publish-"));
  tempRoots.push(root);
  return root;
}

async function writeRun(
  resultsDir: string,
  name: string,
  payload: SitePayload,
  reportHtml = "<!doctype html><html><head><title>t</title></head><body>report</body></html>",
): Promise<void> {
  const dir = join(resultsDir, name);
  mkdirSync(dir, { recursive: true });
  await Bun.write(join(dir, "data.json"), JSON.stringify(payload));
  await Bun.write(join(dir, "report.html"), reportHtml);
}

function payload(name: string, generatedAt: string): SitePayload {
  return {
    name,
    runBatchId: `batch-${name}`,
    generatedAt,
    promptCount: 5,
    modelIds: ["model-a", "model-b"],
    summaries: [
      { modelId: "model-a", okRuns: 5, errorRuns: 0, missingJudgeScores: 0, avgScore: 4.5, truncatedRuns: 0 },
      { modelId: "model-b", okRuns: 5, errorRuns: 0, missingJudgeScores: 0, avgScore: 3.9, truncatedRuns: 0 },
    ],
  };
}

describe("publishSite", () => {
  test("publishes runs and writes a sorted index", async () => {
    const resultsDir = makeResultsDir();
    const outDir = join(mkdtempSync(join(tmpdir(), "bench-publish-out-")), "docs");
    tempRoots.push(outDir);

    await writeRun(resultsDir, "older-run", payload("older-run", "2026-07-01T00:00:00.000Z"));
    await writeRun(resultsDir, "newer-run", payload("newer-run", "2026-07-10T00:00:00.000Z"));

    const result = await publishSite({ resultsDir, outDir, generatedAt: "2026-07-14T00:00:00.000Z" });

    expect(result.published.sort()).toEqual(["newer-run", "older-run"]);
    expect(result.skipped).toEqual([]);

    const index = readFileSync(join(outDir, "index.html"), "utf8");
    expect(index.indexOf("newer-run")).toBeLessThan(index.indexOf("older-run"));
    expect(index).toContain("model-a");

    const runPage = readFileSync(join(outDir, "runs", "newer-run", "index.html"), "utf8");
    expect(runPage).toContain('property="og:title"');
    expect(runPage).toContain("report");
  });

  test("skips entries missing report.html and reports why", async () => {
    const resultsDir = makeResultsDir();
    const outDir = join(mkdtempSync(join(tmpdir(), "bench-publish-out-")), "docs");
    tempRoots.push(outDir);

    const dir = join(resultsDir, "incomplete-run");
    mkdirSync(dir, { recursive: true });
    await Bun.write(join(dir, "data.json"), JSON.stringify(payload("incomplete-run", "2026-07-01T00:00:00.000Z")));

    const result = await publishSite({ resultsDir, outDir });

    expect(result.published).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.name).toBe("incomplete-run");
    expect(result.skipped[0]!.reason).toContain("report.html");
  });

  test("is idempotent -- republishing overwrites cleanly", async () => {
    const resultsDir = makeResultsDir();
    const outDir = join(mkdtempSync(join(tmpdir(), "bench-publish-out-")), "docs");
    tempRoots.push(outDir);
    await writeRun(resultsDir, "run-a", payload("run-a", "2026-07-01T00:00:00.000Z"));

    const first = await publishSite({ resultsDir, outDir });
    const second = await publishSite({ resultsDir, outDir });

    expect(first.published).toEqual(["run-a"]);
    expect(second.published).toEqual(["run-a"]);
  });

  test("refuses to publish when data.json's name doesn't match its directory (path-traversal guard)", async () => {
    const resultsDir = makeResultsDir();
    const outParent = mkdtempSync(join(tmpdir(), "bench-publish-out-"));
    tempRoots.push(outParent);
    const outDir = join(outParent, "docs");

    // Simulates a hand-edited or malicious data.json trying to escape docs/runs/.
    await writeRun(resultsDir, "legit-dir", payload("../../../escaped", "2026-07-01T00:00:00.000Z"));

    const result = await publishSite({ resultsDir, outDir });

    expect(result.published).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.name).toBe("legit-dir");
    expect(result.skipped[0]!.reason).toContain("does not match");

    // Nothing should have been written outside outParent/docs.
    const { readdirSync } = await import("node:fs");
    expect(readdirSync(outParent)).toEqual(["docs"]);
  });

  test("renders an empty-state index when nothing is published", async () => {
    const resultsDir = makeResultsDir();
    const outDir = join(mkdtempSync(join(tmpdir(), "bench-publish-out-")), "docs");
    tempRoots.push(outDir);

    const result = await publishSite({ resultsDir, outDir });

    expect(result.published).toEqual([]);
    const index = readFileSync(join(outDir, "index.html"), "utf8");
    expect(index).toContain("No published runs yet");
  });
});
