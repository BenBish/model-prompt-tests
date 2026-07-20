import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodexHarnessConfig } from "../harnessConfig";
import { buildHarnessEnv } from "./env";
import { extractMessageFromStdout } from "./jsonPath";
import { runCommand } from "./runCommand";
import type { SweHarness, SweHarnessAvailability, SweHarnessInput, SweHarnessResult } from "./types";

/**
 * Runs Codex headlessly (`codex exec --json -o <outside-workdir file>`).
 * Default sandbox is workspace-write; config may escalate to full bypass.
 */
export function createCodexHarness(config: CodexHarnessConfig): SweHarness {
  return {
    harnessId: config.id,
    kind: config.kind,

    resolveModel(alias: string): string | undefined {
      return config.models[alias];
    },

    async available(): Promise<SweHarnessAvailability> {
      const path = Bun.which("codex", { PATH: process.env.PATH ?? "" });
      if (!path) {
        return { ok: false, reason: "codex CLI not found on PATH" };
      }
      return { ok: true };
    },

    async run(input: SweHarnessInput): Promise<SweHarnessResult> {
      // Keep the last-message file outside the agent workdir so the agent cannot tamper with it.
      const outDir = mkdtempSync(join(tmpdir(), "bench-codex-out-"));
      const lastMessagePath = join(outDir, "last-message.txt");
      writeFileSync(lastMessagePath, "");

      try {
        const cmd = [
          "codex",
          "exec",
          "--cd",
          input.workDir,
          "--ephemeral",
          "--skip-git-repo-check",
          "-m",
          input.model,
          "--json",
          "-o",
          lastMessagePath,
        ];

        if (config.dangerouslyBypassApprovalsAndSandbox) {
          cmd.push("--dangerously-bypass-approvals-and-sandbox");
        } else {
          cmd.push("-s", config.sandbox ?? "workspace-write");
        }

        if (config.oss) {
          cmd.push("--oss");
          if (config.localProvider) {
            cmd.push("--local-provider", config.localProvider);
          }
        }

        if (config.ignoreUserConfig) {
          cmd.push("--ignore-user-config");
        }

        if (config.configOverrides) {
          for (const [key, value] of Object.entries(config.configOverrides)) {
            // Codex -c value is TOML-parsed; quote strings that need it.
            const needsQuotes = !/^(true|false|null|-?\d+(\.\d+)?)$/i.test(value) && !value.startsWith('"');
            const encoded = needsQuotes ? `"${value.replaceAll('"', '\\"')}"` : value;
            cmd.push("-c", `${key}=${encoded}`);
          }
        }

        const env = buildHarnessEnv({
          extraKeys: ["OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_HOME", "LOCAL_LLAMACPP_API_KEY"],
          stripPrefixes: ["CLAUDE_CODE_", "CLAUDECODE"],
        });

        const commandResult = await runCommand({
          cmd,
          cwd: input.workDir,
          env,
          timeoutMs: input.timeoutMs,
          stdin: input.taskPrompt,
        });

        let finalMessage = "";
        try {
          finalMessage = readFileSync(lastMessagePath, "utf8").trim();
        } catch {
          // fall through
        }

        const extracted = extractMessageFromStdout(commandResult.stdout, "result");
        if (!finalMessage) {
          finalMessage = extracted.message;
        }

        // Best-effort token/cost extraction from JSONL events when present.
        let inputTokens: number | undefined;
        let outputTokens: number | undefined;
        let costUsd: number | undefined;
        for (const line of commandResult.stdout.split(/\r?\n/)) {
          try {
            const event = JSON.parse(line) as Record<string, unknown>;
            const usage = event.usage as
              | { input_tokens?: number; output_tokens?: number; total_cost_usd?: number }
              | undefined;
            if (usage) {
              if (typeof usage.input_tokens === "number") inputTokens = usage.input_tokens;
              if (typeof usage.output_tokens === "number") outputTokens = usage.output_tokens;
              if (typeof usage.total_cost_usd === "number") costUsd = usage.total_cost_usd;
            }
            if (typeof event.total_cost_usd === "number") costUsd = event.total_cost_usd;
          } catch {
            // skip
          }
        }

        return {
          finalMessage,
          transcript: commandResult.stdout,
          exitCode: commandResult.exitCode,
          latencyMs: commandResult.latencyMs,
          inputTokens,
          outputTokens,
          costUsd,
          timedOut: commandResult.timedOut,
          raw: {
            stdout: commandResult.stdout,
            stderr: commandResult.stderr,
            lastMessagePath,
            parsed: extracted.parsed,
          },
        };
      } finally {
        rmSync(outDir, { recursive: true, force: true });
      }
    },
  };
}
