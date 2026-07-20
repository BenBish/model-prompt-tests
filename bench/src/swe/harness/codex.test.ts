import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CodexHarnessConfig } from "../harnessConfig";
import { createCodexHarness } from "./codex";

const originalPath = process.env.PATH;
let binDir: string;

function writeFakeCodex(script: string): void {
  const path = join(binDir, "codex");
  writeFileSync(path, `#!/usr/bin/env bash\n${script}\n`);
  chmodSync(path, 0o755);
}

beforeEach(() => {
  binDir = mkdtempSync(join(tmpdir(), "fake-codex-bin-"));
  process.env.PATH = `${binDir}:${originalPath}`;
});

afterEach(() => {
  process.env.PATH = originalPath;
  rmSync(binDir, { recursive: true, force: true });
});

function baseConfig(overrides: Partial<CodexHarnessConfig> = {}): CodexHarnessConfig {
  return {
    id: "codex",
    kind: "codex",
    models: { "o4-mini": "o4-mini" },
    sandbox: "workspace-write",
    ...overrides,
  };
}

describe("createCodexHarness", () => {
  test("available() reports ok when the CLI is on PATH", async () => {
    writeFakeCodex("echo '{}'");
    expect(await createCodexHarness(baseConfig()).available()).toEqual({ ok: true });
  });

  test("available() reports not ok when missing", async () => {
    process.env.PATH = "/nonexistent";
    const availability = await createCodexHarness(baseConfig()).available();
    expect(availability.ok).toBe(false);
    expect(availability.reason).toContain("not found on PATH");
  });

  test("resolveModel uses the alias map", () => {
    const harness = createCodexHarness(baseConfig());
    expect(harness.resolveModel("o4-mini")).toBe("o4-mini");
    expect(harness.resolveModel("missing")).toBeUndefined();
  });

  test("prefers -o last-message file over stdout", async () => {
    writeFakeCodex(`
out=""
prev=""
for arg in "$@"; do
  if [[ "$prev" == "-o" ]]; then out="$arg"; fi
  prev="$arg"
done
if [[ -n "$out" ]]; then echo 'from-file' > "$out"; fi
echo '{"type":"item","result":"from-stdout"}'
`);
    const harness = createCodexHarness(baseConfig());
    const result = await harness.run({
      taskPrompt: "say pong",
      model: "o4-mini",
      workDir: process.cwd(),
      timeoutMs: 5000,
    });
    expect(result.finalMessage).toBe("from-file");
    expect(result.exitCode).toBe(0);
  });

  test("falls back to stdout when -o file is empty", async () => {
    writeFakeCodex(`echo '{"result":"stdout-only"}'`);
    const harness = createCodexHarness(baseConfig());
    const result = await harness.run({
      taskPrompt: "x",
      model: "o4-mini",
      workDir: process.cwd(),
      timeoutMs: 5000,
    });
    expect(result.finalMessage).toBe("stdout-only");
  });

  test("passes sandbox flag and can escalate to full bypass", async () => {
    writeFakeCodex(`
if [[ "$*" == *"--dangerously-bypass-approvals-and-sandbox"* ]]; then
  echo '{"result":"bypass"}'
elif [[ "$*" == *"-s workspace-write"* ]] || [[ "$*" == *"workspace-write"* ]]; then
  echo '{"result":"sandboxed"}'
else
  echo '{"result":"other"}'
fi
`);
    const normal = await createCodexHarness(baseConfig()).run({
      taskPrompt: "x",
      model: "o4-mini",
      workDir: process.cwd(),
      timeoutMs: 5000,
    });
    expect(normal.finalMessage).toBe("sandboxed");

    const bypass = await createCodexHarness(
      baseConfig({ dangerouslyBypassApprovalsAndSandbox: true }),
    ).run({
      taskPrompt: "x",
      model: "o4-mini",
      workDir: process.cwd(),
      timeoutMs: 5000,
    });
    expect(bypass.finalMessage).toBe("bypass");
  });
});
