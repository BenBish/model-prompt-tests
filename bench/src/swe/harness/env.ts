const BASE_ENV_KEYS = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"];

export interface BuildHarnessEnvOptions {
  /** Additional env var names to pass through (e.g. ANTHROPIC_API_KEY). */
  extraKeys?: string[];
  /** Env var name prefixes to always exclude, even if they'd otherwise match extraKeys. */
  stripPrefixes?: string[];
}

/**
 * Builds a minimal, whitelisted environment for spawning a harness CLI. Bench itself may be
 * running inside an agent session (e.g. Claude Code), so callers should strip that agent's own
 * env prefix (CLAUDE_CODE_*, CLAUDECODE, ...) to avoid leaking nested-session state into the
 * spawned harness.
 */
export function buildHarnessEnv(options: BuildHarnessEnvOptions = {}): Record<string, string> {
  const keep = new Set([...BASE_ENV_KEYS, ...(options.extraKeys ?? [])]);
  const stripPrefixes = options.stripPrefixes ?? [];
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (!keep.has(key)) continue;
    if (stripPrefixes.some((prefix) => key.startsWith(prefix))) continue;
    env[key] = value;
  }

  return env;
}
