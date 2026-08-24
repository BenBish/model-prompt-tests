import { describe, expect, test } from "bun:test";
import { classifyPromptError } from "./promptOutcome";

describe("classifyPromptError", () => {
  test.each([
    [Object.assign(new Error("rate limited"), { status: 429 }), "rate_limit"],
    [Object.assign(new Error("upstream unavailable"), { status: 503 }), "provider_error"],
    [Object.assign(new Error("request aborted"), { name: "AbortError" }), "timeout"],
    [new TypeError("fetch failed"), "connection_error"],
    [new SyntaxError("invalid JSON"), "candidate_failure"],
    [new Error("response did not contain message content"), "candidate_failure"],
    [new Error("invalid API key"), "harness_error"],
  ] as const)("classifies %s as %s", (error, expected) => {
    expect(classifyPromptError(error)).toBe(expected);
  });
});
