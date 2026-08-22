import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { parsePromptFile } from "./promptTemplate";

const repoRoot = join(import.meta.dir, "../../..");
const hermesDir = join(repoRoot, "hermes");

test("every hermes/*.md prompt parses with a full 1-5 rubric and scoring dimensions", async () => {
  const files = readdirSync(hermesDir)
    .filter((name) => name.endsWith(".md"))
    .sort();
  expect(files.length).toBeGreaterThanOrEqual(6);

  for (const name of files) {
    const parsed = await parsePromptFile(join(hermesDir, name), repoRoot);
    expect(parsed.id).toBe(`hermes/${name.replace(/\.md$/, "")}`);
    expect(parsed.promptText.length).toBeGreaterThan(40);
    expect(parsed.rubric.map((row) => row.score).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(parsed.dimensions?.length).toBeGreaterThanOrEqual(2);
  }
});
