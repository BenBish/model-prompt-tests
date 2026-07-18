import { describe, expect, test } from "bun:test";
import { runCommand } from "./runCommand";

describe("runCommand", () => {
  test("captures stdout, stderr, and exit code", async () => {
    const result = await runCommand({
      cmd: ["bash", "-c", "echo out; echo err >&2; exit 3"],
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" },
      timeoutMs: 5000,
    });

    expect(result.stdout.trim()).toBe("out");
    expect(result.stderr.trim()).toBe("err");
    expect(result.exitCode).toBe(3);
    expect(result.timedOut).toBe(false);
  });

  test("writes stdin to the child process", async () => {
    const result = await runCommand({
      cmd: ["bash", "-c", "cat"],
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" },
      timeoutMs: 5000,
      stdin: "hello from stdin",
    });

    expect(result.stdout).toBe("hello from stdin");
  });

  test("kills the process and reports timedOut on timeout", async () => {
    const result = await runCommand({
      cmd: ["bash", "-c", "sleep 5"],
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" },
      timeoutMs: 200,
    });

    expect(result.timedOut).toBe(true);
  });

  test("truncates output past the 1MB cap", async () => {
    const result = await runCommand({
      cmd: ["bash", "-c", "head -c 2000000 /dev/zero | tr '\\0' 'a'"],
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" },
      timeoutMs: 5000,
    });

    expect(result.stdout).toContain("[truncated at 1000000 bytes]");
    expect(result.stdout.length).toBeLessThan(1_100_000);
  });
});
