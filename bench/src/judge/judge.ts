import type { ModelAdapter } from "../providers/types";
import type { PromptDefinition } from "../types";
import { withRetry } from "../util/retry";
import { buildJudgeSystemPrompt, buildJudgeUserPrompt } from "./buildJudgePrompt";

export interface JudgeResult {
  score: 1 | 2 | 3 | 4 | 5;
  rationale: string;
}

export interface JudgeOutcome {
  result: JudgeResult | null;
  rawJudgeText: string;
  error?: string;
}

export interface RunJudgeOptions {
  retry?: {
    attempts?: number;
    baseDelayMs?: number;
  };
}

const CORRECTIVE_MESSAGE =
  "Your previous reply was not valid JSON matching the required schema. " +
  'Reply with ONLY the JSON object: {"score": <integer 1-5>, "rationale": "<string>"}';

function extractFirstJsonObject(text: string): unknown | undefined {
  const start = text.indexOf("{");
  if (start === -1) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i]!;

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

function validateJudgeResult(parsed: unknown): JudgeResult | undefined {
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const obj = parsed as Record<string, unknown>;
  const score = obj.score;
  const rationale = obj.rationale;

  if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 5) {
    return undefined;
  }
  if (typeof rationale !== "string" || rationale.trim().length === 0) {
    return undefined;
  }

  return { score: score as JudgeResult["score"], rationale };
}

export async function runJudge(
  judgeAdapter: ModelAdapter,
  prompt: PromptDefinition,
  candidateOutput: string,
  options: RunJudgeOptions = {},
): Promise<JudgeOutcome> {
  const systemPrompt = buildJudgeSystemPrompt();
  const userPrompt = buildJudgeUserPrompt(prompt, candidateOutput);

  let lastText = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const effectiveUserPrompt = attempt === 0 ? userPrompt : `${userPrompt}\n\n${CORRECTIVE_MESSAGE}`;

    try {
      const response = await withRetry(
        () =>
          judgeAdapter.call({
            systemPrompt,
            userPrompt: effectiveUserPrompt,
            temperature: 0,
          }),
        options.retry ?? {},
      );
      lastText = response.text;

      const parsed = extractFirstJsonObject(response.text);
      const validated = parsed ? validateJudgeResult(parsed) : undefined;

      if (validated) {
        return { result: validated, rawJudgeText: response.text };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        result: null,
        rawJudgeText: "",
        error: `judge request failed: ${message}`,
      };
    }
  }

  return {
    result: null,
    rawJudgeText: lastText,
    error: "judge did not return a valid JSON score after 2 attempts",
  };
}
