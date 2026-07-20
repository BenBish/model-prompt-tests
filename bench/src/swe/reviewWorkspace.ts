import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildHarnessEnv } from "./harness/env";
import { runCommand } from "./harness/runCommand";
import type { CodeReviewSweTask } from "./taskSpec";
import type { ProvisionedWorkspace } from "./workspace";

function gitEnv(): Record<string, string> {
  return {
    ...buildHarnessEnv(),
    GIT_AUTHOR_NAME: "bench",
    GIT_AUTHOR_EMAIL: "bench@localhost",
    GIT_COMMITTER_NAME: "bench",
    GIT_COMMITTER_EMAIL: "bench@localhost",
  };
}

/**
 * Diff-only code-review workspace: instructions + DIFF.patch (no full mini-repo).
 * The agent is expected to write a review in its final message, not apply a patch.
 */
export async function provisionCodeReviewWorkspace(
  task: CodeReviewSweTask,
  workspaceDir: string,
): Promise<ProvisionedWorkspace & { diffText: string; reviewPrompt: string }> {
  const diffText = readFileSync(task.diffPatchPath, "utf8");
  if (diffText.trim() === "") {
    throw new Error(`empty diff patch: ${task.diffPatchPath}`);
  }

  mkdirSync(workspaceDir, { recursive: true });
  const env = gitEnv();

  writeFileSync(`${workspaceDir}/DIFF.patch`, diffText);
  writeFileSync(
    `${workspaceDir}/README.md`,
    [
      "# Code review task",
      "",
      "Review the unified diff in `DIFF.patch` as a senior engineer.",
      "Lead with findings ordered by severity. Focus on correctness, edge cases,",
      "maintainability, and missing tests. Do not rewrite the whole module unless necessary.",
      "",
      "Write your full review as your final message (plain text or markdown).",
      "Do not attempt to apply the patch or edit product code unless the task explicitly requires it.",
      "",
    ].join("\n"),
  );

  await runCommand({ cmd: ["git", "init", "-q", "-b", "main"], cwd: workspaceDir, env, timeoutMs: 10_000 });
  await runCommand({ cmd: ["git", "add", "-A"], cwd: workspaceDir, env, timeoutMs: 10_000 });
  await runCommand({
    cmd: ["git", "commit", "-q", "-m", "baseline"],
    cwd: workspaceDir,
    env,
    timeoutMs: 10_000,
  });
  const shaResult = await runCommand({
    cmd: ["git", "rev-parse", "HEAD"],
    cwd: workspaceDir,
    env,
    timeoutMs: 10_000,
  });
  const baselineSha = shaResult.stdout.trim();

  const reviewPrompt = [
    task.taskText.trim(),
    "",
    "---",
    "",
    "Unified diff to review (also available as DIFF.patch in the workspace):",
    "",
    "```diff",
    diffText.trimEnd(),
    "```",
  ].join("\n");

  return {
    dir: workspaceDir,
    baselineSha,
    postSetupSha: baselineSha,
    diffText,
    reviewPrompt,
  };
}
