import { describe, expect, test } from "bun:test";
import { parseBunTestSummary } from "./verifyOutputParser";

describe("parseBunTestSummary", () => {
  test("parses a mixed pass/fail summary", () => {
    const output = `bun test v1.3.14 (0d9b296a)

tests/a.test.ts:
(fail) fail one [0.08ms]

 2 pass
 1 fail
 3 expect() calls
Ran 3 tests across 1 file. [8.00ms]`;
    expect(parseBunTestSummary("bun test", output)).toEqual({ testsPassed: 2, testsTotal: 3 });
  });

  test("parses an all-passing summary", () => {
    const output = `bun test v1.3.14 (0d9b296a)

 9 pass
 0 fail
 13 expect() calls
Ran 9 tests across 3 files. [587.00ms]`;
    expect(parseBunTestSummary("bun test", output)).toEqual({ testsPassed: 9, testsTotal: 9 });
  });

  test("parses an all-failing summary", () => {
    const output = ` 0 pass
 6 fail
Ran 6 tests across 2 files. [120.00ms]`;
    expect(parseBunTestSummary("bun test", output)).toEqual({ testsPassed: 0, testsTotal: 6 });
  });

  test("returns undefined for a non-bun-test verify command", () => {
    expect(parseBunTestSummary("npm test", " 2 pass\n 1 fail\n")).toBeUndefined();
    expect(parseBunTestSummary("pytest -q", " 2 pass\n 1 fail\n")).toBeUndefined();
  });

  test("returns undefined when output has no recognizable summary", () => {
    expect(parseBunTestSummary("bun test", "some unrelated crash output")).toBeUndefined();
  });

  test("tolerates a bun test invocation with extra flags/args", () => {
    const output = " 1 pass\n 0 fail\n";
    expect(parseBunTestSummary("bun test --timeout 60000", output)).toEqual({ testsPassed: 1, testsTotal: 1 });
  });
});
