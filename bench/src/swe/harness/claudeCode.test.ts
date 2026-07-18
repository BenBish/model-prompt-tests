import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ClaudeCodeHarnessConfig } from "../harnessConfig";
import { createClaudeCodeHarness } from "./claudeCode";

const originalPath = process.env.PATH;
let binDir: string;

function writeFakeClaude(script: string): void {
  const path = join(binDir, "claude");
  writeFileSync(path, `#!/usr/bin/env bash\n${script}\n`);
  chmodSync(path, 0o755);
}

beforeEach(() => {
  binDir = mkdtempSync(join(tmpdir(), "fake-claude-bin-"));
  process.env.PATH = `${binDir}:${originalPath}`;
});

afterEach(() => {
  process.env.PATH = originalPath;
  rmSync(binDir, { recursive: true, force: true });
});

function baseConfig(): ClaudeCodeHarnessConfig {
  return { id: "claude-code", kind: "claude-code", models: { sonnet: "claude-sonnet-5" }, maxTurns: 10 };
}

describe("createClaudeCodeHarness", () => {
  test("available() reports ok when the CLI is on PATH", async () => {
    writeFakeClaude("echo '{}'");
    const harness = createClaudeCodeHarness(baseConfig());
    expect(await harness.available()).toEqual({ ok: true });
  });

  test("available() reports not ok when the CLI is missing", async () => {
    process.env.PATH = "/nonexistent";
    const harness = createClaudeCodeHarness(baseConfig());
    const availability = await harness.available();
    expect(availability.ok).toBe(false);
    expect(availability.reason).toContain("not found on PATH");
  });

  test("resolveModel looks up the configured alias map", () => {
    const harness = createClaudeCodeHarness(baseConfig());
    expect(harness.resolveModel("sonnet")).toBe("claude-sonnet-5");
    expect(harness.resolveModel("nonexistent")).toBeUndefined();
  });

  test("parses the result JSON into finalMessage/tokens/cost", async () => {
    writeFakeClaude(
      `cat <<'JSON'\n{"type":"result","result":"all done","total_cost_usd":0.05,"usage":{"input_tokens":10,"output_tokens":20}}\nJSON`,
    );
    const harness = createClaudeCodeHarness(baseConfig());
    const result = await harness.run({
      taskPrompt: "fix the bug",
      model: "claude-sonnet-5",
      workDir: process.cwd(),
      timeoutMs: 5000,
    });

    expect(result.finalMessage).toBe("all done");
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(20);
    expect(result.costUsd).toBe(0.05);
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  test("falls back to raw stdout as finalMessage when the CLI output isn't valid JSON", async () => {
    writeFakeClaude("echo 'not json at all'");
    const harness = createClaudeCodeHarness(baseConfig());
    const result = await harness.run({
      taskPrompt: "fix the bug",
      model: "claude-sonnet-5",
      workDir: process.cwd(),
      timeoutMs: 5000,
    });

    expect(result.finalMessage.trim()).toBe("not json at all");
    expect(result.inputTokens).toBeUndefined();
  });

  test("passes --bare only when configured, and requests --max-turns from config", async () => {
    writeFakeClaude(`
      if [[ "$*" == *"--bare"* ]]; then echo '{"result":"bare-mode"}'; else echo '{"result":"normal-mode"}'; fi
    `);
    const harness = createClaudeCodeHarness({ ...baseConfig(), bare: true });
    const result = await harness.run({
      taskPrompt: "x",
      model: "claude-sonnet-5",
      workDir: process.cwd(),
      timeoutMs: 5000,
    });
    expect(result.finalMessage).toBe("bare-mode");
  });

  test("strips CLAUDE_CODE_/CLAUDECODE env vars from the spawned process", async () => {
    writeFakeClaude(`
      if [[ -n "$CLAUDE_CODE_SESSION_ID" || -n "$CLAUDECODE" ]]; then
        echo '{"result":"leaked"}'
      else
        echo '{"result":"clean"}'
      fi
    `);
    process.env.CLAUDE_CODE_SESSION_ID = "leaked-session";
    process.env.CLAUDECODE = "1";
    try {
      const harness = createClaudeCodeHarness(baseConfig());
      const result = await harness.run({
        taskPrompt: "x",
        model: "claude-sonnet-5",
        workDir: process.cwd(),
        timeoutMs: 5000,
      });
      expect(result.finalMessage).toBe("clean");
    } finally {
      delete process.env.CLAUDE_CODE_SESSION_ID;
      delete process.env.CLAUDECODE;
    }
  });

  test("reports timedOut when the process is killed for exceeding timeoutMs", async () => {
    writeFakeClaude("sleep 5; echo '{}'");
    const harness = createClaudeCodeHarness(baseConfig());
    const result = await harness.run({
      taskPrompt: "x",
      model: "claude-sonnet-5",
      workDir: process.cwd(),
      timeoutMs: 200,
    });
    expect(result.timedOut).toBe(true);
  });
});
