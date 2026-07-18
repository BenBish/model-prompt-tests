import { expect, test } from "bun:test";
import { unlink, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseTaskFile } from "./taskSpec";

function fixtureMarkdown(frontmatterExtra = "", bodyExtra = ""): string {
  return [
    "---",
    "type: fixture",
    "verify: bun test",
    frontmatterExtra,
    "---",
    "# Fix the thing",
    "",
    "## Task",
    "",
    "```text",
    "Do the thing.",
    "```",
    "",
    "## Judging Guidance",
    "",
    "- Reward doing the thing well.",
    bodyExtra,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

async function parseMarkdown(markdown: string) {
  const taskDir = join(tmpdir(), `model-prompt-tests-task-${crypto.randomUUID()}`);
  await mkdir(taskDir, { recursive: true });
  const path = join(taskDir, "task.md");
  await Bun.write(path, markdown);
  try {
    return await parseTaskFile(path, tmpdir());
  } finally {
    await unlink(path).catch(() => {});
    await rm(taskDir, { recursive: true, force: true }).catch(() => {});
  }
}

test("parses a minimal fixture task with defaults", async () => {
  const task = await parseMarkdown(fixtureMarkdown());
  expect(task.type).toBe("fixture");
  expect(task.title).toBe("Fix the thing");
  expect(task.taskText).toBe("Do the thing.");
  expect(task.judgingGuidance).toEqual(["Reward doing the thing well."]);
  if (task.type === "fixture") {
    expect(task.verify).toBe("bun test");
    expect(task.projectDir.endsWith("/project")).toBe(true);
    expect(task.hiddenDir.endsWith("/hidden")).toBe(true);
  }
  expect(task.verifyTimeoutMs).toBe(120_000);
  expect(task.agentTimeoutMs).toBe(600_000);
  expect(task.ignorePaths).toEqual(["node_modules"]);
  expect(task.tags).toEqual([]);
  expect(task.dimensions).toBeUndefined();
});

test("parses scalar overrides and comma-separated list fields", async () => {
  const task = await parseMarkdown(
    fixtureMarkdown("verifyTimeoutMs: 5000\nagentTimeoutMs: 9000\nsetup: bun install\ntags: a, b, c"),
  );
  expect(task.verifyTimeoutMs).toBe(5000);
  expect(task.agentTimeoutMs).toBe(9000);
  expect(task.setup).toBe("bun install");
  expect(task.tags).toEqual(["a", "b", "c"]);
});

test("parses indented list-style frontmatter values", async () => {
  const markdown = [
    "---",
    "type: fixture",
    "verify: bun test",
    "ignorePaths:",
    "  - node_modules",
    "  - dist",
    "---",
    "# Fix the thing",
    "",
    "## Task",
    "",
    "```text",
    "Do the thing.",
    "```",
  ].join("\n");
  const task = await parseMarkdown(markdown);
  expect(task.ignorePaths).toEqual(["node_modules", "dist"]);
});

test("parses Scoring Dimensions using the shared prompt-file parser", async () => {
  const markdown = [
    fixtureMarkdown(),
    "",
    "## Scoring Dimensions",
    "",
    "- `correctness` (weight 3): Fixes the bug generally.",
    "- `code-quality` (weight 2): Minimal diff.",
  ].join("\n");
  const task = await parseMarkdown(markdown);
  expect(task.dimensions).toEqual([
    { id: "correctness", weight: 3, description: "Fixes the bug generally." },
    { id: "code-quality", weight: 2, description: "Minimal diff." },
  ]);
});

test("rejects a missing frontmatter block", async () => {
  await expect(
    parseMarkdown("# Fix the thing\n\n## Task\n\n```text\nDo it.\n```\n"),
  ).rejects.toThrow("missing required frontmatter block");
});

test("rejects an unknown task type", async () => {
  const markdown = fixtureMarkdown().replace("type: fixture", "type: bogus");
  await expect(parseMarkdown(markdown)).rejects.toThrow('unknown task type "bogus"');
});

test("rejects a fixture task missing the required verify key", async () => {
  const markdown = [
    "---",
    "type: fixture",
    "---",
    "# Fix the thing",
    "",
    "## Task",
    "",
    "```text",
    "Do it.",
    "```",
  ].join("\n");
  await expect(parseMarkdown(markdown)).rejects.toThrow('missing required frontmatter key "verify"');
});

test("parses an external task's repo/commit/testPaths fields", async () => {
  const markdown = [
    "---",
    "type: external",
    "verify: npm test",
    "repoUrl: https://github.com/example/repo.git",
    "commitSha: abc123",
    "testPaths: test/foo.test.ts, test/bar.test.ts",
    "---",
    "# Fix an upstream bug",
    "",
    "## Task",
    "",
    "```text",
    "Fix it.",
    "```",
  ].join("\n");
  const task = await parseMarkdown(markdown);
  expect(task.type).toBe("external");
  if (task.type === "external") {
    expect(task.repoUrl).toBe("https://github.com/example/repo.git");
    expect(task.commitSha).toBe("abc123");
    expect(task.testPaths).toEqual(["test/foo.test.ts", "test/bar.test.ts"]);
  }
});
