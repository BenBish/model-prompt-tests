import type { PromptDefinition } from "../types";

const JUDGE_SYSTEM_PROMPT = `You are an impartial evaluator scoring a candidate model's response to a fixed test prompt.
Score strictly against the rubric provided. Do not reward length, confidence, or formatting polish on their own.
Reply with ONLY a single JSON object matching this shape, and nothing else (no markdown fences, no commentary):
{"score": <integer 1-5>, "rationale": "<1-3 sentence justification citing specific signals from the response>"}`;

export function buildJudgeUserPrompt(prompt: PromptDefinition, candidateOutput: string): string {
  const rubricText = prompt.rubric
    .map((entry) => `- ${entry.score}: ${entry.description}`)
    .join("\n");

  const sections = [
    `# Original test prompt\n${prompt.promptText}`,
    prompt.whatThisTests.length
      ? `# What this tests\n${prompt.whatThisTests.map((s) => `- ${s}`).join("\n")}`
      : undefined,
    prompt.strongSignals.length
      ? `# Strong answer signals\n${prompt.strongSignals.map((s) => `- ${s}`).join("\n")}`
      : undefined,
    prompt.weakSignals.length
      ? `# Weak answer signals\n${prompt.weakSignals.map((s) => `- ${s}`).join("\n")}`
      : undefined,
    `# Scoring rubric\n${rubricText}`,
    `# Candidate response to score\n${candidateOutput}`,
  ].filter(Boolean);

  return sections.join("\n\n");
}

export function buildJudgeSystemPrompt(): string {
  return JUDGE_SYSTEM_PROMPT;
}
