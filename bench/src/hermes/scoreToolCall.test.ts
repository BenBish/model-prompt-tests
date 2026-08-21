import { describe, expect, test } from "bun:test";
import { scoreToolProbeCase } from "./scoreToolCall";
import type { ToolProbeCase } from "./toolCases";
import type { ModelToolCall } from "../providers/types";

function positiveCase(overrides: Partial<ToolProbeCase["expect"]> = {}): ToolProbeCase {
  return {
    id: "case",
    description: "d",
    userMessage: "m",
    tools: [],
    expect: { toolName: "set_reminder", requiredArgs: ["time", "message"], ...overrides },
  };
}

function negativeCase(): ToolProbeCase {
  return { id: "case", description: "d", userMessage: "m", tools: [], expect: { shouldNotCall: true } };
}

function call(name: string, args: string): ModelToolCall {
  return { id: "1", name, arguments: args };
}

describe("scoreToolProbeCase — positive cases", () => {
  test("well-formed, correct tool, all required args present", () => {
    const score = scoreToolProbeCase([call("set_reminder", '{"time":"9am","message":"call dentist"}')], positiveCase());
    expect(score).toMatchObject({ wellFormed: true, correctTool: true, validArgs: true, calledTool: "set_reminder" });
  });

  test("no tool call made when one was expected", () => {
    const score = scoreToolProbeCase(undefined, positiveCase());
    expect(score).toMatchObject({ wellFormed: false, correctTool: false, validArgs: false });
    expect(score.notes).toContain("no tool call made");
  });

  test("wrong tool called — correctTool false even with well-formed args", () => {
    const score = scoreToolProbeCase([call("send_message", '{"to":"x","text":"y"}')], positiveCase());
    expect(score).toMatchObject({ wellFormed: true, correctTool: false, validArgs: false, calledTool: "send_message" });
  });

  test("right tool, malformed JSON arguments", () => {
    const score = scoreToolProbeCase([call("set_reminder", "{not json")], positiveCase());
    expect(score).toMatchObject({ wellFormed: false, correctTool: true, validArgs: false });
    expect(score.notes).toContain("did not parse");
  });

  test("right tool, well-formed args, missing a required key", () => {
    const score = scoreToolProbeCase([call("set_reminder", '{"time":"9am"}')], positiveCase());
    expect(score).toMatchObject({ wellFormed: true, correctTool: true, validArgs: false });
    expect(score.notes).toContain("message");
  });

  test("right tool, required key present but empty string counts as missing", () => {
    const score = scoreToolProbeCase([call("set_reminder", '{"time":"9am","message":"  "}')], positiveCase());
    expect(score.validArgs).toBe(false);
    expect(score.notes).toContain("message");
  });

  test("arguments that parse to a JSON array, not an object, are not well-formed", () => {
    const score = scoreToolProbeCase([call("set_reminder", "[1,2,3]")], positiveCase());
    expect(score.wellFormed).toBe(false);
  });

  test("only scores the first tool call and notes extras", () => {
    const score = scoreToolProbeCase(
      [call("set_reminder", '{"time":"9am","message":"x"}'), call("send_message", '{"to":"a","text":"b"}')],
      positiveCase(),
    );
    expect(score.validArgs).toBe(true);
    expect(score.notes).toContain("1 additional call(s) ignored");
  });
});

describe("scoreToolProbeCase — negative cases (shouldNotCall)", () => {
  test("correctly makes no call", () => {
    const score = scoreToolProbeCase(undefined, negativeCase());
    expect(score).toMatchObject({ wellFormed: true, correctTool: true, validArgs: true });
  });

  test("correctly makes no call — empty array also counts as no call", () => {
    const score = scoreToolProbeCase([], negativeCase());
    expect(score).toMatchObject({ correctTool: true, validArgs: true });
  });

  test("incorrectly calls a tool when none was expected, with well-formed args", () => {
    const score = scoreToolProbeCase([call("send_message", '{"to":"a","text":"b"}')], negativeCase());
    expect(score).toMatchObject({ wellFormed: true, correctTool: false, validArgs: false, calledTool: "send_message" });
    expect(score.notes).toContain("no tool call was expected");
  });

  test("incorrectly calls a tool when none was expected, with malformed JSON args", () => {
    const score = scoreToolProbeCase([call("send_message", "{not json")], negativeCase());
    expect(score).toMatchObject({ wellFormed: false, correctTool: false, validArgs: false, calledTool: "send_message" });
    expect(score.notes).toContain("no tool call was expected");
    expect(score.notes).toContain("did not parse as a JSON object");
  });
});

describe("scoreToolProbeCase — malformed case definitions", () => {
  test("throws when a case sets neither toolName nor shouldNotCall", () => {
    const badCase: ToolProbeCase = { id: "bad", description: "d", userMessage: "m", tools: [], expect: {} };
    expect(() => scoreToolProbeCase(undefined, badCase)).toThrow('case "bad"');
  });
});
