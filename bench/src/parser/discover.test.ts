import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverPromptFiles, resolvePromptSelector } from "./discover";

const tempRoots: string[] = [];

function makeTempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "bench-discover-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe("resolvePromptSelector", () => {
  test("does not allow direct selectors to bypass excluded paths", async () => {
    const repoRoot = makeTempRepo();
    const excludedReadme = join(repoRoot, "bench", "README.md");
    mkdirSync(join(repoRoot, "bench"));
    writeFileSync(excludedReadme, "# Not a prompt\n", { flush: true });

    await expect(resolvePromptSelector(repoRoot, "bench/README.md")).resolves.toEqual([]);
  });

  test("does not resolve direct selectors outside the repo root", async () => {
    const repoRoot = makeTempRepo();
    const outsidePrompt = join(repoRoot, "..", "outside-prompt.md");
    writeFileSync(outsidePrompt, "# Outside prompt\n", { flush: true });

    await expect(resolvePromptSelector(repoRoot, "../outside-prompt.md")).resolves.toEqual([]);
    rmSync(outsidePrompt, { force: true });
  });

  test("excludes benchmark-results/ so bench export output isn't parsed as a prompt", async () => {
    const repoRoot = makeTempRepo();
    mkdirSync(join(repoRoot, "benchmark-results", "some-run"), { recursive: true });
    // A real bench-export markdown file has no "## Prompt" section and would
    // fail promptTemplate parsing if discovery ever picked it up.
    writeFileSync(
      join(repoRoot, "benchmark-results", "some-run", "per-prompt-results.md"),
      "# Per-Prompt Results\n\n| Prompt | score |\n",
      { flush: true },
    );

    expect(await discoverPromptFiles(repoRoot)).toEqual([]);
    await expect(resolvePromptSelector(repoRoot, "all")).resolves.toEqual([]);
  });

  test("excludes docs/ (bench publish output)", async () => {
    const repoRoot = makeTempRepo();
    mkdirSync(join(repoRoot, "docs", "runs", "some-run"), { recursive: true });
    writeFileSync(join(repoRoot, "docs", "index.md"), "# Not a prompt\n", { flush: true });

    expect(await discoverPromptFiles(repoRoot)).toEqual([]);
  });
});
