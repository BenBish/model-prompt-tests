import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { GenericCliHarnessConfig } from "../harnessConfig";
import { createGenericCliHarness, expandCommandTemplate } from "./genericCli";

const originalPath = process.env.PATH;
let binDir: string;

function writeFakeBinary(name: string, script: string): void {
  const path = join(binDir, name);
  writeFileSync(path, `#!/usr/bin/env bash\n${script}\n`);
  chmodSync(path, 0o755);
}

beforeEach(() => {
  binDir = mkdtempSync(join(tmpdir(), "fake-generic-cli-bin-"));
  process.env.PATH = `${binDir}:${originalPath}`;
});

afterEach(() => {
  process.env.PATH = originalPath;
  rmSync(binDir, { recursive: true, force: true });
});

describe("expandCommandTemplate", () => {
  test("substitutes model, workdir, and promptFile placeholders", () => {
    expect(
      expandCommandTemplate(["tool", "-m", "{model}", "--cwd", "{workdir}", "--file", "{promptFile}"], {
        model: "m1",
        workdir: "/ws",
        promptFile: "/tmp/p.txt",
      }),
    ).toEqual(["tool", "-m", "m1", "--cwd", "/ws", "--file", "/tmp/p.txt"]);
  });
});

describe("createGenericCliHarness", () => {
  function grokishConfig(overrides: Partial<GenericCliHarnessConfig> = {}): GenericCliHarnessConfig {
    return {
      id: "grok",
      kind: "generic-cli",
      binary: "fake-grok",
      command: ["fake-grok", "-p", "--cwd", "{workdir}", "-m", "{model}"],
      promptVia: "stdin",
      resultPath: "result",
      models: { "grok-4": "grok-4" },
      ...overrides,
    };
  }

  test("available() checks the configured binary", async () => {
    writeFakeBinary("fake-grok", "echo '{}'");
    expect(await createGenericCliHarness(grokishConfig()).available()).toEqual({ ok: true });
    process.env.PATH = "/nonexistent";
    const missing = await createGenericCliHarness(grokishConfig()).available();
    expect(missing.ok).toBe(false);
  });

  test("parses resultPath from JSON stdout", async () => {
    writeFakeBinary("fake-grok", `echo '{"result":"pong","usage":{}}'`);
    const harness = createGenericCliHarness(grokishConfig());
    const result = await harness.run({
      taskPrompt: "say pong",
      model: "grok-4",
      workDir: process.cwd(),
      timeoutMs: 5000,
    });
    expect(result.finalMessage).toBe("pong");
  });

  test("promptVia file writes the prompt and expands {promptFile}", async () => {
    writeFakeBinary(
      "fake-grok",
      `echo "{\\"result\\":\\"$(cat "$2")\\"}"`,
    );
    // command: fake-grok --prompt-file {promptFile}
    const harness = createGenericCliHarness(
      grokishConfig({
        command: ["fake-grok", "--prompt-file", "{promptFile}"],
        promptVia: "file",
      }),
    );
    const result = await harness.run({
      taskPrompt: "hello-from-file",
      model: "grok-4",
      workDir: process.cwd(),
      timeoutMs: 5000,
    });
    expect(result.finalMessage).toBe("hello-from-file");
  });

  test("falls back to whole stdout when not JSON", async () => {
    writeFakeBinary("fake-grok", "echo plain-out");
    const harness = createGenericCliHarness(grokishConfig());
    const result = await harness.run({
      taskPrompt: "x",
      model: "grok-4",
      workDir: process.cwd(),
      timeoutMs: 5000,
    });
    expect(result.finalMessage.trim()).toBe("plain-out");
  });

  test("rejects {promptFile} in the template when promptVia is not file", async () => {
    writeFakeBinary("fake-grok", "echo ok");
    const harness = createGenericCliHarness(
      grokishConfig({
        command: ["fake-grok", "--file", "{promptFile}"],
        promptVia: "stdin",
      }),
    );
    await expect(
      harness.run({
        taskPrompt: "x",
        model: "grok-4",
        workDir: process.cwd(),
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/promptVia is "stdin"/);
  });
});
