import type { ModelAdapter } from "../providers/types";
import type { RubricDimension } from "../types";
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
  /** Number of corrective attempts on the legacy plain-text path. Defaults to 2. */
  attempts?: number;
  /** Prefix used when the underlying adapter call throws. Defaults to "request failed". */
  requestErrorPrefix?: string;
  /** Builds the error message when no attempt yields a valid response. */
  exhaustedErrorMessage?: (attempts: number) => string;
  /**
   * Optional JSON schema for a structured-output first attempt. Built dynamically
   * when dimensions are present (see buildJudgeResultJsonSchema).
   */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
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
 * Errors that plausibly mean "this provider doesn't support forced JSON schema /
 * tool-call output" rather than a transient or auth failure. Only these fall
 * back to the legacy plain-text contract.
 */
export function looksLikeUnsupportedStructuredOutput(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const status = (err as { status?: number }).status;
  if (status === 400 || status === 404 || status === 422) return true;
  // Deliberately exclude bare "tools" — too common in unrelated error text.
  return /response_format|json_schema|tool_choice|tool_use/i.test(err.message);
}

/** Holistic judge schema, optionally extended with Phase 1 scoring dimensions. */
export function buildJudgeResultJsonSchema(
  dimensions: RubricDimension[] | undefined,
): { name: string; schema: Record<string, unknown> } {
  const properties: Record<string, unknown> = {
    score: { type: "integer", minimum: 1, maximum: 5 },
    rationale: { type: "string", minLength: 1 },
  };
  const required: string[] = ["score", "rationale"];

  if (dimensions && dimensions.length > 0) {
    const dimensionProperties: Record<string, unknown> = {};
    const dimensionRequired: string[] = [];
    for (const dim of dimensions) {
      dimensionProperties[dim.id] = {
        type: "object",
        properties: {
          score: { type: "integer", minimum: 1, maximum: 5 },
          rationale: { type: "string", minLength: 1 },
        },
        required: ["score", "rationale"],
        additionalProperties: false,
      };
      dimensionRequired.push(dim.id);
    }
    properties.dimensions = {
      type: "object",
      properties: dimensionProperties,
      required: dimensionRequired,
      additionalProperties: false,
    };
    required.push("dimensions");
  }

  return {
    name: "submit_score",
    schema: {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
  };
}

/**
 * Calls an adapter expecting a single JSON object in the response, validating and retrying
 * with a corrective follow-up message when the response is missing or malformed.
 *
 * When `jsonSchema` is provided, first attempts a schema-enforced call; on
 * `looksLikeUnsupportedStructuredOutput` only, falls back to the plain-text contract.
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

  if (options.jsonSchema) {
    try {
      const response = await withRetry(
        () =>
          adapter.call({
            systemPrompt,
            userPrompt,
            temperature: 0,
            jsonSchema: options.jsonSchema,
          }),
        options.retry ?? {},
      );
      lastText = response.text;
      const parsed = extractFirstJsonObject(response.text);
      const validated = parsed ? validate(parsed) : undefined;
      if (validated) {
        return { result: validated, rawText: response.text };
      }
      // Provider accepted structured output but returned something invalid —
      // fall through to the legacy retry loop rather than treating as unsupported.
    } catch (err) {
      if (!looksLikeUnsupportedStructuredOutput(err)) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          result: null,
          rawText: "",
          error: `${requestErrorPrefix}: ${message}`,
        };
      }
      // Fall back to plain-text JSON contract.
    }
  }

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
