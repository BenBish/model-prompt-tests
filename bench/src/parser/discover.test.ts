import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolvePromptSelector } from "./discover";

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
