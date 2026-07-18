const MAX_OUTPUT_BYTES = 1_000_000;

export interface RunCommandInput {
  cmd: string[];
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
  stdin?: string;
}

export interface RunCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  latencyMs: number;
}

async function readCapped(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_OUTPUT_BYTES) {
        const keep = MAX_OUTPUT_BYTES - (total - value.byteLength);
        if (keep > 0) chunks.push(value.subarray(0, keep));
        truncated = true;
        break;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const text = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf-8");
  return truncated ? `${text}\n...[truncated at ${MAX_OUTPUT_BYTES} bytes]` : text;
}

// A harness CLI (claude/codex/grok) may spawn its own subprocesses (git, bash tool calls, ...).
// Killing only the direct child on timeout would leave those running. When `setsid` is available
// we run the command as its own session/process-group leader so a timeout can kill the whole
// group via a negative-PID signal; otherwise we fall back to killing just the direct child.
let setsidPathCache: string | null | undefined;
function setsidPath(): string | null {
  if (setsidPathCache === undefined) setsidPathCache = Bun.which("setsid");
  return setsidPathCache;
}

/** Spawns a harness CLI, feeding it stdin if given, killing it (and its process group) on timeout, and capping output size. */
export async function runCommand(input: RunCommandInput): Promise<RunCommandResult> {
  const started = performance.now();
  const useSetsid = setsidPath() !== null;
  const cmd = useSetsid ? ["setsid", ...input.cmd] : input.cmd;

  const proc = Bun.spawn({
    cmd,
    cwd: input.cwd,
    env: input.env,
    stdin: input.stdin !== undefined ? "pipe" : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  if (input.stdin !== undefined && proc.stdin && typeof proc.stdin !== "number") {
    proc.stdin.write(input.stdin);
    proc.stdin.end();
  }

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    try {
      process.kill(useSetsid ? -proc.pid : proc.pid, "SIGKILL");
    } catch {
      proc.kill();
    }
  }, input.timeoutMs);

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      readCapped(proc.stdout),
      readCapped(proc.stderr),
      proc.exited,
    ]);

    return {
      stdout,
      stderr,
      exitCode,
      timedOut,
      latencyMs: performance.now() - started,
    };
  } finally {
    clearTimeout(timeout);
  }
}
