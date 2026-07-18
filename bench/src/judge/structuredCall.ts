import type { ModelAdapter } from "../providers/types";
import { withRetry } from "../util/retry";

export interface StructuredCallOutcome<T> {
  result: T | null;
  rawText: string;
  error?: string;
}

export interface StructuredCallOptions {
  retry?: {
    attempts?: number;
    baseDelayMs?: number;
  };
  /** Number of corrective attempts before giving up. Defaults to 2. */
  attempts?: number;
  /** Prefix used when the underlying adapter call throws. Defaults to "request failed". */
  requestErrorPrefix?: string;
  /** Builds the error message when no attempt yields a valid response. */
  exhaustedErrorMessage?: (attempts: number) => string;
}

export function extractFirstJsonObject(text: string): unknown | undefined {
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

/**
 * Calls an adapter expecting a single JSON object in the response, validating and retrying
 * with a corrective follow-up message when the response is missing or malformed. Shared by
 * the holistic/dimensional judge and (later) the SWE review matcher.
 */
export async function runStructuredLlmCall<T>(
  adapter: ModelAdapter,
  systemPrompt: string,
  userPrompt: string,
  validate: (parsed: unknown) => T | undefined,
  correctiveMessage: string,
  options: StructuredCallOptions = {},
): Promise<StructuredCallOutcome<T>> {
  const maxAttempts = options.attempts ?? 2;
  const requestErrorPrefix = options.requestErrorPrefix ?? "request failed";
  const exhaustedErrorMessage =
    options.exhaustedErrorMessage ??
    ((attempts: number) => `did not return a valid JSON response after ${attempts} attempts`);

  let lastText = "";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const effectiveUserPrompt = attempt === 0 ? userPrompt : `${userPrompt}\n\n${correctiveMessage}`;

    try {
      const response = await withRetry(
        () =>
          adapter.call({
            systemPrompt,
            userPrompt: effectiveUserPrompt,
            temperature: 0,
          }),
        options.retry ?? {},
      );
      lastText = response.text;

      const parsed = extractFirstJsonObject(response.text);
      const validated = parsed ? validate(parsed) : undefined;

      if (validated) {
        return { result: validated, rawText: response.text };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        result: null,
        rawText: "",
        error: `${requestErrorPrefix}: ${message}`,
      };
    }
  }

  return {
    result: null,
    rawText: lastText,
    error: exhaustedErrorMessage(maxAttempts),
  };
}
