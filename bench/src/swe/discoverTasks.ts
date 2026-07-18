import { isAbsolute, join } from "node:path";
import { parseTaskFile, type SweTask } from "./taskSpec";

function isUnsafeSelector(selector: string): boolean {
  return isAbsolute(selector) || selector.split(/[\\/]+/).includes("..");
}

export async function discoverTaskFiles(repoRoot: string): Promise<string[]> {
  const glob = new Bun.Glob("swe-tasks/*/*/task.md");
  const paths: string[] = [];
  for await (const relPath of glob.scan({ cwd: repoRoot })) {
    paths.push(join(repoRoot, relPath));
  }
  return paths.sort();
}

export async function resolveTaskSelector(repoRoot: string, selector: string): Promise<string[]> {
  if (selector === "all") {
    return discoverTaskFiles(repoRoot);
  }
  if (isUnsafeSelector(selector)) {
    return [];
  }

  const normalized = selector.replace(/\/task\.md$/, "").replace(/\/$/, "");
  const glob = new Bun.Glob(`swe-tasks/${normalized}/task.md`);
  const matches: string[] = [];
  for await (const relPath of glob.scan({ cwd: repoRoot })) {
    matches.push(join(repoRoot, relPath));
  }

  return matches.sort();
}

export async function loadTasks(repoRoot: string, selector: string): Promise<SweTask[]> {
  const files = await resolveTaskSelector(repoRoot, selector);
  return Promise.all(files.map((f) => parseTaskFile(f, repoRoot)));
}
