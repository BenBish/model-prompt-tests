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
    return {
      wellFormed: true,
      correctTool: false,
      validArgs: false,
      calledTool: toolCalls[0]!.name,
      argumentsRaw: toolCalls[0]!.arguments,
      notes: `called ${toolCalls[0]!.name} when no tool call was expected${extraCallsNote}`,
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
