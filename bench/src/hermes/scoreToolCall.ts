import type { ModelToolCall } from "../providers/types";
import type { ToolProbeCase } from "./toolCases";

export interface ToolProbeScore {
  /** The single tool call arguments parsed as valid JSON (or no call made, for a negative case). */
  wellFormed: boolean;
  /** Called the one expected tool (positive case) or correctly made no call (negative case). */
  correctTool: boolean;
  /** For a positive case: wellFormed, correctTool, and every requiredArgs key present and non-empty. */
  validArgs: boolean;
  calledTool?: string;
  argumentsRaw?: string;
  notes?: string;
}

function firstNonEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** True when `argumentsRaw` parses as a JSON object (not an array, not a scalar). */
function isWellFormedJsonObject(argumentsRaw: string): boolean {
  try {
    const parsed = JSON.parse(argumentsRaw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/** Pure scorer: no network, no DB. Scores exactly against the model's first tool call (if any). */
export function scoreToolProbeCase(
  toolCalls: ModelToolCall[] | undefined,
  testCase: ToolProbeCase,
): ToolProbeScore {
  const extraCallsNote =
    toolCalls && toolCalls.length > 1 ? ` (${toolCalls.length - 1} additional call(s) ignored)` : "";

  if (testCase.expect.shouldNotCall) {
    if (!toolCalls || toolCalls.length === 0) {
      return { wellFormed: true, correctTool: true, validArgs: true, notes: "correctly made no call" };
    }
    const unwantedCall = toolCalls[0]!;
    const unwantedCallWellFormed = isWellFormedJsonObject(unwantedCall.arguments);
    const malformedNote = unwantedCallWellFormed ? "" : "; arguments also did not parse as a JSON object";
    return {
      wellFormed: unwantedCallWellFormed,
      correctTool: false,
      validArgs: false,
      calledTool: unwantedCall.name,
      argumentsRaw: unwantedCall.arguments,
      notes: `called ${unwantedCall.name} when no tool call was expected${malformedNote}${extraCallsNote}`,
    };
  }

  const expectedTool = testCase.expect.toolName;
  if (!expectedTool) {
    throw new Error(`toolCases: case "${testCase.id}" must set expect.toolName or expect.shouldNotCall`);
  }

  if (!toolCalls || toolCalls.length === 0) {
    return { wellFormed: false, correctTool: false, validArgs: false, notes: "no tool call made" };
  }

  const call = toolCalls[0]!;
  const correctTool = call.name === expectedTool;

  let parsedArgs: Record<string, unknown> | undefined;
  let wellFormed = false;
  try {
    const parsed = JSON.parse(call.arguments);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      parsedArgs = parsed as Record<string, unknown>;
      wellFormed = true;
    }
  } catch {
    // malformed JSON arguments — wellFormed stays false
  }

  if (!wellFormed) {
    return {
      wellFormed: false,
      correctTool,
      validArgs: false,
      calledTool: call.name,
      argumentsRaw: call.arguments,
      notes: `arguments did not parse as a JSON object${extraCallsNote}`,
    };
  }

  const requiredArgs = testCase.expect.requiredArgs ?? [];
  const missing = requiredArgs.filter((key) => !firstNonEmptyValue(parsedArgs![key]));
  const validArgs = correctTool && missing.length === 0;

  return {
    wellFormed,
    correctTool,
    validArgs,
    calledTool: call.name,
    argumentsRaw: call.arguments,
    notes:
      missing.length > 0
        ? `missing/empty required argument(s): ${missing.join(", ")}${extraCallsNote}`
        : extraCallsNote || undefined,
  };
}
