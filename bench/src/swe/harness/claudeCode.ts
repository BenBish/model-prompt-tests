import type { ClaudeCodeHarnessConfig } from "../harnessConfig";
import { buildHarnessEnv } from "./env";
import { runCommand } from "./runCommand";
import type { SweHarness, SweHarnessAvailability, SweHarnessInput, SweHarnessResult } from "./types";

interface ClaudeResultJson {
  result?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

function parseClaudeResult(stdout: string): ClaudeResultJson | undefined {
  try {
    return JSON.parse(stdout.trim());
  } catch {
    return undefined;
  }
}

/**
 * Runs Claude Code headlessly (`claude -p --output-format json`). Does NOT pass `--bare` by
 * default: `--bare` skips normal OAuth/subscription session-credential discovery and requires
 * ANTHROPIC_API_KEY explicitly (confirmed empirically), which most interactive `claude` users
 * won't have set. Set `bare: true` in the harness config for hermetic runs when ANTHROPIC_API_KEY
 * is available.
 */
export function createClaudeCodeHarness(config: ClaudeCodeHarnessConfig): SweHarness {
  return {
    harnessId: config.id,
    kind: config.kind,

    resolveModel(alias: string): string | undefined {
      return config.models[alias];
    },

    async available(): Promise<SweHarnessAvailability> {
      const path = Bun.which("claude", { PATH: process.env.PATH ?? "" });
      if (!path) {
        return { ok: false, reason: "claude CLI not found on PATH" };
      }
      return { ok: true };
    },

    async run(input: SweHarnessInput): Promise<SweHarnessResult> {
      const cmd = [
        "claude",
        "-p",
        "--output-format",
        "json",
        "--model",
        input.model,
        "--dangerously-skip-permissions",
        "--max-turns",
        String(config.maxTurns ?? 60),
      ];
      if (config.bare) cmd.push("--bare");

      const env = buildHarnessEnv({
        extraKeys: ["ANTHROPIC_API_KEY"],
        stripPrefixes: ["CLAUDE_CODE_", "CLAUDECODE"],
      });

      const commandResult = await runCommand({
        cmd,
        cwd: input.workDir,
        env,
        timeoutMs: input.timeoutMs,
        stdin: input.taskPrompt,
      });

      const parsed = parseClaudeResult(commandResult.stdout);
      const finalMessage = parsed?.result ?? commandResult.stdout;

      return {
        finalMessage,
        transcript: commandResult.stdout,
        exitCode: commandResult.exitCode,
        latencyMs: commandResult.latencyMs,
        inputTokens: parsed?.usage?.input_tokens,
        outputTokens: parsed?.usage?.output_tokens,
        costUsd: parsed?.total_cost_usd,
        timedOut: commandResult.timedOut,
        raw: parsed ?? { stdout: commandResult.stdout, stderr: commandResult.stderr },
      };
    },
  };
}
