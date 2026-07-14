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

export const JUDGE_RESULT_JSON_SCHEMA = {
  name: "submit_score",
  schema: {
    type: "object",
    properties: {
      score: { type: "integer", minimum: 1, maximum: 5 },
      rationale: { type: "string", minLength: 1 },
    },
    required: ["score", "rationale"],
    additionalProperties: false,
  },
} as const;

// Errors from a structured-output attempt that plausibly mean "this provider
// doesn't support forced JSON schema / tool-call output" rather than a
// transient or auth failure. Only these are worth retrying on the legacy
// plain-text JSON contract; anything else should fail the same way it would
// have before structured output existed.
function looksLikeUnsupportedStructuredOutput(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const status = (err as { status?: number }).status;
  if (status === 400 || status === 404 || status === 422) return true;
  // Deliberately specific API-parameter-name terms only. A bare "tools" was
  // dropped from this list: it's a common enough English word that it could
  // false-positive on an unrelated error (network/5xx/rate-limit message
  // that happens to mention tools) and misroute it into the legacy-contract
  // fallback instead of surfacing the real error immediately.
  return /response_format|json_schema|tool_choice|tool_use/i.test(err.message);
}

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

  try {
    const response = await withRetry(
      () =>
        judgeAdapter.call({
          systemPrompt,
          userPrompt,
          temperature: 0,
          jsonSchema: JUDGE_RESULT_JSON_SCHEMA,
        }),
      options.retry ?? {},
    );
    lastText = response.text;
    const parsed = extractFirstJsonObject(response.text);
    const validated = parsed ? validateJudgeResult(parsed) : undefined;
    if (validated) {
      return { result: validated, rawJudgeText: response.text };
    }
    // Provider accepted the structured-output request but returned
    // something that doesn't validate; fall through to the legacy retry
    // loop below rather than treating this as an unsupported-feature signal.
  } catch (err) {
    if (!looksLikeUnsupportedStructuredOutput(err)) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        result: null,
        rawJudgeText: "",
        error: `judge request failed: ${message}`,
      };
    }
    // Provider likely doesn't support forced JSON schema / tool-call output;
    // fall back to the plain-text JSON contract below.
  }

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
