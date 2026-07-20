import { expect, test } from "bun:test";
import { unlink } from "node:fs/promises";
import type { PromptDefinition } from "../types";
import { parsePromptFile } from "./promptTemplate";

function promptMarkdown(lineEnding = "\n", extraRubric = ""): string {
  return [
    "# Test",
    "",
    "## Prompt",
    "",
    "```text",
    "Say hello.",
    "```",
    "",
    "## Scoring Rubric",
    "",
    "- `5`: Excellent",
    "- `4`: Good",
    "- `3`: Acceptable",
    "- `2`: Weak",
    "- `1`: Poor",
    extraRubric,
  ]
    .filter((line) => line !== "")
    .join(lineEnding);
}

async function parseMarkdown(markdown: string): Promise<PromptDefinition> {
  const path = `/tmp/model-prompt-tests-${crypto.randomUUID()}.md`;
  await Bun.write(path, markdown);
  try {
    return await parsePromptFile(path, "/tmp");
  } finally {
    await unlink(path);
  }
}

test("parses CRLF prompt fences", async () => {
  const parsed = await parseMarkdown(promptMarkdown("\r\n"));
  expect(parsed.promptText).toBe("Say hello.");
});

test("rejects duplicate rubric scores", async () => {
  await expect(parseMarkdown(promptMarkdown("\n", "- `5`: Duplicate"))).rejects.toThrow(
    "duplicate scores",
  );
});

test("rejects out-of-range rubric scores", async () => {
  await expect(parseMarkdown(promptMarkdown("\n", "- `9`: Invalid"))).rejects.toThrow(
    "invalid score(s): 9",
  );
});

function promptMarkdownWithDimensions(dimensionLines: string[]): string {
  return [
    promptMarkdown(),
    "",
    "## Scoring Dimensions",
    "",
    ...dimensionLines,
  ].join("\n");
}

test("parses valid scoring dimensions", async () => {
  const parsed = await parseMarkdown(
    promptMarkdownWithDimensions([
      "- `correctness` (weight 3): Identifies the core bug.",
      "- `code-quality` (weight 2): Minimal, idiomatic fix.",
    ]),
  );
  expect(parsed.dimensions).toEqual([
    { id: "correctness", weight: 3, description: "Identifies the core bug." },
    { id: "code-quality", weight: 2, description: "Minimal, idiomatic fix." },
  ]);
});

test("returns undefined dimensions when the section is absent", async () => {
  const parsed = await parseMarkdown(promptMarkdown());
  expect(parsed.dimensions).toBeUndefined();
});

test("rejects a Scoring Dimensions section with no matching entries", async () => {
  await expect(
    parseMarkdown(promptMarkdownWithDimensions(["Just some prose, no bullets."])),
  ).rejects.toThrow("has no entries matching");
});

test("rejects duplicate dimension ids", async () => {
  await expect(
    parseMarkdown(
      promptMarkdownWithDimensions([
        "- `correctness` (weight 3): First.",
        "- `correctness` (weight 2): Duplicate id.",
      ]),
    ),
  ).rejects.toThrow("duplicate dimension ids");
});

test("rejects out-of-range dimension weights", async () => {
  await expect(
    parseMarkdown(
      promptMarkdownWithDimensions([
        "- `correctness` (weight 9): Too high.",
        "- `code-quality` (weight 2): Fine.",
      ]),
    ),
  ).rejects.toThrow("invalid weight(s): correctness=9");
});

test("rejects fewer than 2 dimensions", async () => {
  await expect(
    parseMarkdown(promptMarkdownWithDimensions(["- `correctness` (weight 3): Only one."])),
  ).rejects.toThrow("must have between 2 and 5 entries, found 1");
});

test("rejects more than 5 dimensions", async () => {
  await expect(
    parseMarkdown(
      promptMarkdownWithDimensions([
        "- `d1` (weight 1): One.",
        "- `d2` (weight 1): Two.",
        "- `d3` (weight 1): Three.",
        "- `d4` (weight 1): Four.",
        "- `d5` (weight 1): Five.",
        "- `d6` (weight 1): Six.",
      ]),
    ),
  ).rejects.toThrow("must have between 2 and 5 entries, found 6");
});
