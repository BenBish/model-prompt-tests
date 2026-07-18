export interface SweHarnessInput {
  taskPrompt: string;
  /** Harness-native model name (already resolved from an alias). */
  model: string;
  workDir: string;
  timeoutMs: number;
}

export interface SweHarnessResult {
  finalMessage: string;
  transcript?: string;
  exitCode: number;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  timedOut: boolean;
  raw: unknown;
}

export interface SweHarnessAvailability {
  ok: boolean;
  reason?: string;
}

export interface SweHarness {
  readonly harnessId: string;
  readonly kind: string;
  /** Checks whether this harness can run at all (binary on PATH, etc). */
  available(): Promise<SweHarnessAvailability>;
  /** Resolves a CLI-facing model alias to whatever this harness's run() needs. */
  resolveModel(alias: string): string | undefined;
  run(input: SweHarnessInput): Promise<SweHarnessResult>;
}
