import { afterEach, describe, expect, test } from "bun:test";
import { buildHarnessEnv } from "./env";

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
    expect(env.PATH).toBe(process.env.PATH);
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

  test("omits undefined-valued keys", () => {
    delete process.env.PATH;
    const env = buildHarnessEnv();
    expect("PATH" in env).toBe(false);
  });
});
