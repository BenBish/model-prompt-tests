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
