import { relative } from "node:path";
import type { RubricDimension } from "../types";
import { PromptParseError, extractBullets, extractDimensions, extractFencedText, splitSections } from "../parser/promptTemplate";

const LIST_KEYS = new Set(["tags", "testPaths", "contextFiles", "ignorePaths", "envPassthrough"]);
const DEFAULT_VERIFY_TIMEOUT_MS = 120_000;
const DEFAULT_AGENT_TIMEOUT_MS = 600_000;
const DEFAULT_IGNORE_PATHS = ["node_modules"];

export interface SweTaskBase {
  id: string;
  filePath: string;
  taskDir: string;
  title: string;
  taskText: string;
  judgingGuidance: string[];
  dimensions?: RubricDimension[];
  verifyTimeoutMs: number;
  agentTimeoutMs: number;
  setup?: string;
  tags: string[];
  ignorePaths: string[];
  envPassthrough: string[];
}

export interface FixtureSweTask extends SweTaskBase {
  type: "fixture";
  verify: string;
  projectDir: string;
  hiddenDir: string;
}

export interface ExternalSweTask extends SweTaskBase {
  type: "external";
  verify: string;
  repoUrl: string;
  commitSha: string;
  testPaths: string[];
  contextFiles?: string[];
  holdoutPatch?: string;
}

export interface CodeReviewSweTask extends SweTaskBase {
  type: "code-review";
  diffPatchPath: string;
  findingsPath: string;
}

export type SweTask = FixtureSweTask | ExternalSweTask | CodeReviewSweTask;

type Frontmatter = Record<string, string | string[]>;

function parseFrontmatter(filePath: string, raw: string): { frontmatter: Frontmatter; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    throw new PromptParseError(filePath, "missing required frontmatter block ('---' ... '---')");
  }
  const frontmatterBlock = match[1]!;
  const body = raw.slice(match[0].length);

  const lines = frontmatterBlock.split(/\r?\n/);
  const frontmatter: Frontmatter = {};
  let currentListKey: string | undefined;

  for (const line of lines) {
    if (line.trim() === "") {
      currentListKey = undefined;
      continue;
    }
    const listItemMatch = line.match(/^\s+-\s+(.+)$/);
    if (listItemMatch) {
      if (!currentListKey) {
        throw new PromptParseError(filePath, `list item outside of a list key: "${line}"`);
      }
      (frontmatter[currentListKey] as string[]).push(listItemMatch[1]!.trim());
      continue;
    }

    const kvMatch = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (!kvMatch) {
      throw new PromptParseError(filePath, `unrecognized frontmatter line: "${line}"`);
    }
    const key = kvMatch[1]!;
    const value = kvMatch[2]!.trim();

    if (value === "") {
      frontmatter[key] = [];
      currentListKey = key;
    } else if (LIST_KEYS.has(key)) {
      frontmatter[key] = value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      currentListKey = undefined;
    } else {
      frontmatter[key] = value;
      currentListKey = undefined;
    }
  }

  return { frontmatter, body };
}

function stringField(filePath: string, frontmatter: Frontmatter, key: string): string | undefined {
  const value = frontmatter[key];
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    throw new PromptParseError(filePath, `frontmatter key "${key}" must be a scalar value, not a list`);
  }
  return value;
}

function listField(filePath: string, frontmatter: Frontmatter, key: string): string[] | undefined {
  const value = frontmatter[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new PromptParseError(filePath, `frontmatter key "${key}" must be a list, not a scalar value`);
  }
  return value;
}

function positiveIntField(
  filePath: string,
  frontmatter: Frontmatter,
  key: string,
  fallback: number,
): number {
  const raw = stringField(filePath, frontmatter, key);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new PromptParseError(filePath, `frontmatter key "${key}" must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

function requireStringField(filePath: string, frontmatter: Frontmatter, key: string): string {
  const value = stringField(filePath, frontmatter, key);
  if (!value) {
    throw new PromptParseError(filePath, `missing required frontmatter key "${key}"`);
  }
  return value;
}

export async function parseTaskFile(filePath: string, repoRoot: string): Promise<SweTask> {
  const raw = await Bun.file(filePath).text();
  const { frontmatter, body } = parseFrontmatter(filePath, raw);

  const titleMatch = body.match(/^#\s+(.+)$/m);
  if (!titleMatch) {
    throw new PromptParseError(filePath, "missing required H1 title (e.g. '# Fix the debounce utility')");
  }

  const sections = splitSections(body);
  const id = relative(repoRoot, filePath).replace(/[\\/]task\.md$/, "");
  const taskDir = filePath.replace(/[\\/]task\.md$/, "");

  const base = {
    id,
    filePath,
    taskDir,
    title: titleMatch[1]!.trim(),
    taskText: extractFencedText(filePath, "Task", sections.get("Task")),
    judgingGuidance: extractBullets(sections.get("Judging Guidance")),
    dimensions: extractDimensions(filePath, sections.get("Scoring Dimensions")),
    verifyTimeoutMs: positiveIntField(filePath, frontmatter, "verifyTimeoutMs", DEFAULT_VERIFY_TIMEOUT_MS),
    agentTimeoutMs: positiveIntField(filePath, frontmatter, "agentTimeoutMs", DEFAULT_AGENT_TIMEOUT_MS),
    setup: stringField(filePath, frontmatter, "setup"),
    tags: listField(filePath, frontmatter, "tags") ?? [],
    ignorePaths: listField(filePath, frontmatter, "ignorePaths") ?? DEFAULT_IGNORE_PATHS,
    envPassthrough: listField(filePath, frontmatter, "envPassthrough") ?? [],
  };

  const type = requireStringField(filePath, frontmatter, "type");

  if (type === "fixture") {
    return {
      ...base,
      type: "fixture",
      verify: requireStringField(filePath, frontmatter, "verify"),
      projectDir: `${taskDir}/project`,
      hiddenDir: `${taskDir}/hidden`,
    };
  }

  if (type === "external") {
    return {
      ...base,
      type: "external",
      verify: requireStringField(filePath, frontmatter, "verify"),
      repoUrl: requireStringField(filePath, frontmatter, "repoUrl"),
      commitSha: requireStringField(filePath, frontmatter, "commitSha"),
      testPaths: listField(filePath, frontmatter, "testPaths") ?? [],
      contextFiles: listField(filePath, frontmatter, "contextFiles"),
      holdoutPatch: stringField(filePath, frontmatter, "holdoutPatch"),
    };
  }

  if (type === "code-review") {
    return {
      ...base,
      type: "code-review",
      diffPatchPath: `${taskDir}/diff.patch`,
      findingsPath: `${taskDir}/findings.json`,
    };
  }

  throw new PromptParseError(filePath, `unknown task type "${type}" (expected fixture, external, or code-review)`);
}
