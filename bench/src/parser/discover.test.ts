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
});

describe("discoverPromptFiles", () => {
  test("excludes benchmark-results, swe-tasks, and playwright-mcp scratch files", async () => {
    const repoRoot = makeTempRepo();
    mkdirSync(join(repoRoot, "benchmark-results", "some-run"), { recursive: true });
    mkdirSync(join(repoRoot, "swe-tasks", "fixture", "smoke"), { recursive: true });
    mkdirSync(join(repoRoot, ".playwright-mcp"), { recursive: true });
    writeFileSync(
      join(repoRoot, "benchmark-results", "some-run", "article.md"),
      "# Not a prompt, no rubric section\n",
      { flush: true },
    );
    writeFileSync(
      join(repoRoot, "swe-tasks", "fixture", "smoke", "task.md"),
      "---\ntype: fixture\n---\n# Smoke task\n",
      { flush: true },
    );
    writeFileSync(join(repoRoot, ".playwright-mcp", "page.md"), "not a prompt\n", { flush: true });
    writeFileSync(join(repoRoot, "real-prompt.md"), "# Real prompt\n", { flush: true });

    const files = await discoverPromptFiles(repoRoot);
    expect(files).toEqual([join(repoRoot, "real-prompt.md")]);
  });
});
