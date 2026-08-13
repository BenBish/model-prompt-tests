import { isAbsolute, join, relative, resolve } from "node:path";
import { parsePromptFile } from "./promptTemplate";
import type { PromptDefinition } from "../types";
import { CALIBRATION_PROMPT_IDS, isCalibrationSelector } from "../calibrate/subset";

const EXCLUDED_PREFIXES = [
  "templates/",
  "node_modules/",
  "bench/",
  "swe-tasks/",
  "benchmark-results/",
  "docs/",
  ".playwright-mcp/",
];
const EXCLUDED_FILES = new Set(["README.md"]);

function isExcluded(relPath: string): boolean {
  if (EXCLUDED_FILES.has(relPath)) return true;
  return EXCLUDED_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function isUnsafeSelector(selector: string): boolean {
  return isAbsolute(selector) || selector.split(/[\\/]+/).includes("..");
}

function repoRelativePath(repoRoot: string, filePath: string): string | undefined {
  const root = resolve(repoRoot);
  const absolutePath = resolve(filePath);
  const relPath = relative(root, absolutePath).replaceAll("\\", "/");
  if (relPath === "" || relPath.startsWith("../") || relPath === ".." || isAbsolute(relPath)) {
    return undefined;
  }
  return relPath;
}

export async function discoverPromptFiles(repoRoot: string): Promise<string[]> {
  const glob = new Bun.Glob("**/*.md");
  const paths: string[] = [];
  for await (const relPath of glob.scan({ cwd: repoRoot })) {
    if (isExcluded(relPath)) continue;
    paths.push(join(repoRoot, relPath));
  }
  return paths.sort();
}

export async function resolvePromptSelector(
  repoRoot: string,
  selector: string,
): Promise<string[]> {
  if (selector === "all") {
    return discoverPromptFiles(repoRoot);
  }
  if (isCalibrationSelector(selector)) {
    const files: string[] = [];
    const missing: string[] = [];
    for (const id of CALIBRATION_PROMPT_IDS) {
      const direct = join(repoRoot, `${id}.md`);
      const relPath = repoRelativePath(repoRoot, direct);
      if (relPath && !isExcluded(relPath) && (await Bun.file(direct).exists())) {
        files.push(direct);
      } else {
        missing.push(`${id}.md`);
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `calibration subset is incomplete; missing ${missing.join(", ")} (expected ${CALIBRATION_PROMPT_IDS.length} prompts)`,
      );
    }
    return files;
  }
  if (isUnsafeSelector(selector)) {
    return [];
  }

  const glob = new Bun.Glob(selector.endsWith(".md") ? selector : `${selector}`);
  const matches: string[] = [];
  for await (const relPath of glob.scan({ cwd: repoRoot })) {
    if (isExcluded(relPath)) continue;
    matches.push(join(repoRoot, relPath));
  }

  // Selector may be an exact relative file path rather than a glob pattern.
  if (matches.length === 0) {
    const direct = join(repoRoot, selector.endsWith(".md") ? selector : `${selector}.md`);
    const relPath = repoRelativePath(repoRoot, direct);
    if (relPath && !isExcluded(relPath) && (await Bun.file(direct).exists())) {
      matches.push(direct);
    }
  }

  return matches.sort();
}

export async function loadPrompts(repoRoot: string, selector: string): Promise<PromptDefinition[]> {
  const files = await resolvePromptSelector(repoRoot, selector);
  return Promise.all(files.map((f) => parsePromptFile(f, repoRoot)));
}

export function promptIdFromPath(repoRoot: string, filePath: string): string {
  return relative(repoRoot, filePath).replace(/\.md$/, "");
}
