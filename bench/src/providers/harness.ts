// Phase 2 stub — not implemented in the MVP.
//
// Once built, an AgentHarness will let prompts run through real tool-using
// coding agents (Claude Code, Codex CLI, Opencode, OMP) instead of a plain
// single-turn API call. It plugs into the same pipeline via CandidateRunner
// (see runner/candidateRunner.ts) so runBatch/db/judge/report need no changes.

export interface HarnessResult {
  finalOutputText: string;
  transcript: unknown;
  workDir: string;
  latencyMs: number;
  exitCode?: number;
  raw: unknown;
}

export interface AgentHarness {
  readonly harnessId: string;
  run(promptText: string, workDir: string): Promise<HarnessResult>;
}
