import { describe, expect, test } from "bun:test";
import { extractMessageFromStdout, getJsonPath } from "./jsonPath";

describe("getJsonPath", () => {
  test("walks dotted paths", () => {
    expect(getJsonPath({ a: { b: "c" } }, "a.b")).toBe("c");
    expect(getJsonPath({ a: 1 }, "a.b")).toBeUndefined();
  });
});

describe("extractMessageFromStdout", () => {
  test("reads resultPath from a single JSON object", () => {
    const { message, parsed } = extractMessageFromStdout(
      JSON.stringify({ result: "pong", extra: 1 }),
      "result",
    );
    expect(message).toBe("pong");
    expect(parsed).toEqual({ result: "pong", extra: 1 });
  });

  test("falls back to whole stdout when JSON has no matching path", () => {
    const raw = JSON.stringify({ other: "x" });
    const { message } = extractMessageFromStdout(raw, "result");
    expect(message).toBe(raw);
  });

  test("reads resultPath from the last matching JSONL line", () => {
    const stdout = [
      JSON.stringify({ type: "start" }),
      JSON.stringify({ type: "message", result: "mid" }),
      JSON.stringify({ type: "message", result: "final" }),
      "not-json",
    ].join("\n");
    const { message } = extractMessageFromStdout(stdout, "result");
    expect(message).toBe("final");
  });

  test("uses whole stdout when not JSON", () => {
    const { message } = extractMessageFromStdout("plain text reply");
    expect(message).toBe("plain text reply");
  });
});
