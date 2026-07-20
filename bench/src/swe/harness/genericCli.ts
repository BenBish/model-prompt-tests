import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GenericCliHarnessConfig } from "../harnessConfig";
import { buildHarnessEnv } from "./env";
import { extractMessageFromStdout } from "./jsonPath";
import { runCommand } from "./runCommand";
import type { SweHarness, SweHarnessAvailability, SweHarnessInput, SweHarnessResult } from "./types";

export function expandCommandTemplate(
  template: string[],
  vars: { model: string; workdir: string; promptFile: string },
): string[] {
  return template.map((part) =>
    part
      .replaceAll("{model}", vars.model)
      .replaceAll("{workdir}", vars.workdir)
      .replaceAll("{promptFile}", vars.promptFile),
  );
}

/**
 * Config-driven CLI harness for tools like Grok and omp.
 * Template placeholders: `{model}`, `{workdir}`, `{promptFile}`.
 * `resultPath` selects a JSON field for the final message; whole stdout is the fallback.
 */
export function createGenericCliHarness(config: GenericCliHarnessConfig): SweHarness {
  const binary = config.binary ?? config.command[0]!;
  const promptVia = config.promptVia ?? "stdin";

  return {
    harnessId: config.id,
    kind: config.kind,

    resolveModel(alias: string): string | undefined {
      return config.models[alias];
    },

    async available(): Promise<SweHarnessAvailability> {
      const path = Bun.which(binary, { PATH: process.env.PATH ?? "" });
      if (!path) {
        return { ok: false, reason: `${binary} CLI not found on PATH` };
      }
      return { ok: true };
    },

    async run(input: SweHarnessInput): Promise<SweHarnessResult> {
      const tempDir = mkdtempSync(join(tmpdir(), "bench-generic-cli-"));
      const promptFile = join(tempDir, "prompt.txt");
      const templateHasPromptFile = config.command.some((part) => part.includes("{promptFile}"));

      if (promptVia === "file" && !templateHasPromptFile) {
        throw new Error(
          `generic-cli harness "${config.id}": promptVia "file" requires {promptFile} in command`,
        );
      }
      if (promptVia !== "file" && templateHasPromptFile) {
        throw new Error(
          `generic-cli harness "${config.id}": command includes {promptFile} but promptVia is "${promptVia}" (use promptVia "file")`,
        );
      }

      if (promptVia === "file") {
        writeFileSync(promptFile, input.taskPrompt);
      }

      try {
        let cmd = expandCommandTemplate(config.command, {
          model: input.model,
          workdir: input.workDir,
          promptFile: promptVia === "file" ? promptFile : "",
        });

        let stdin: string | undefined;
        if (promptVia === "stdin") {
          stdin = input.taskPrompt;
        } else if (promptVia === "arg") {
          cmd = [...cmd, input.taskPrompt];
        }

        const env = buildHarnessEnv({
          extraKeys: config.extraEnvKeys,
          stripPrefixes: config.stripPrefixes ?? ["CLAUDE_CODE_", "CLAUDECODE"],
        });

        const commandResult = await runCommand({
          cmd,
          cwd: input.workDir,
          env,
          timeoutMs: input.timeoutMs,
          stdin,
        });

        const extracted = extractMessageFromStdout(commandResult.stdout, config.resultPath);

        return {
          finalMessage: extracted.message,
          transcript: commandResult.stdout,
          exitCode: commandResult.exitCode,
          latencyMs: commandResult.latencyMs,
          timedOut: commandResult.timedOut,
          raw: {
            stdout: commandResult.stdout,
            stderr: commandResult.stderr,
            parsed: extracted.parsed,
          },
        };
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
  };
}
