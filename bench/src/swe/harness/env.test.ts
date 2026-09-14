import { afterEach, describe, expect, test } from "bun:test";
import { delimiter } from "node:path";
import { buildHarnessEnv, bunRuntimeDir } from "./env";

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});

describe("buildHarnessEnv", () => {
  test("keeps only PATH/HOME/TMPDIR/LANG/LC_ALL by default", () => {
    process.env.SOME_RANDOM_VAR = "leak-me-not";
    const env = buildHarnessEnv();
    expect(env.SOME_RANDOM_VAR).toBeUndefined();
    expect(env.PATH).toBeDefined();
    const bunDir = bunRuntimeDir();
    if (Bun.which("bun", { PATH: process.env.PATH ?? "" }) !== null) {
      expect(env.PATH).toBe(process.env.PATH);
    } else if (bunDir) {
      const pathParts = env.PATH?.split(delimiter) ?? [];
      expect(pathParts[0]).toBe(bunDir);
      expect(pathParts.slice(1).join(delimiter)).toBe(process.env.PATH ?? "");
    }
  });

  test("passes through explicitly requested extra keys", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const env = buildHarnessEnv({ extraKeys: ["ANTHROPIC_API_KEY"] });
    expect(env.ANTHROPIC_API_KEY).toBe("test-key");
  });

  test("strips keys matching a given prefix even if in extraKeys", () => {
    process.env.CLAUDE_CODE_SESSION_ID = "abc";
    process.env.CLAUDECODE = "1";
    const env = buildHarnessEnv({
      extraKeys: ["CLAUDE_CODE_SESSION_ID", "CLAUDECODE"],
      stripPrefixes: ["CLAUDE_CODE_", "CLAUDECODE"],
    });
    expect(env.CLAUDE_CODE_SESSION_ID).toBeUndefined();
    expect(env.CLAUDECODE).toBeUndefined();
  });

  test("omits undefined-valued keys and synthesizes PATH when bun is missing", () => {
    delete process.env.PATH;
    delete process.env.UNSET_WHITELIST_KEY;
    const env = buildHarnessEnv({ extraKeys: ["UNSET_WHITELIST_KEY"] });
    expect("UNSET_WHITELIST_KEY" in env).toBe(false);
    expect(env.HOME).toBe(originalEnv.HOME);
    const bunDir = bunRuntimeDir();
    expect(bunDir).toBeDefined();
    expect(env.PATH).toBe(bunDir);
    expect(Bun.which("bun", { PATH: env.PATH }) !== null).toBe(true);
  });

  test("prepends the running bun directory when bun is not on PATH", () => {
    const existing = "/tmp/definitely-not-bun-bin";
    process.env.PATH = existing;
    const env = buildHarnessEnv();
    const bunDir = bunRuntimeDir();
    expect(bunDir).toBeDefined();
    const parts = env.PATH?.split(delimiter) ?? [];
    expect(parts[0]).toBe(bunDir);
    expect(parts).toContain(existing);
    expect(Bun.which("bun", { PATH: env.PATH }) !== null).toBe(true);
  });
});
