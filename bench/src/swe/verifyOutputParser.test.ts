import { describe, expect, test } from "bun:test";
import { parseBunTestSummary, parseVerificationOutput } from "./verifyOutputParser";

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

describe("parseVerificationOutput", () => {
  test("parses TAP", () => expect(parseVerificationOutput("node --test", "TAP version 13\nok 1 - yes\nnot ok 2 - no\nok 3 - later # SKIP"))
    .toMatchObject({ format: "tap", passed: 1, failed: 1, skipped: 1, total: 3 }));
  test("parses JUnit", () => expect(parseVerificationOutput("junit report", '<testsuite tests="8" failures="2" errors="1" skipped="1">'))
    .toMatchObject({ format: "junit", passed: 4, failed: 3, skipped: 1, total: 8 }));
  test("does not double-count nested JUnit suites", () => expect(parseVerificationOutput("junit report", '<testsuite tests="5" failures="1"><testsuite tests="2" failures="0"></testsuite><testsuite tests="3" failures="1"></testsuite></testsuite>'))
    .toMatchObject({ format: "junit", passed: 4, failed: 1, total: 5 }));
  test("parses pytest", () => expect(parseVerificationOutput("python -m pytest", "7 passed, 2 failed, 1 error, 3 skipped in 1.2s"))
    .toMatchObject({ format: "pytest", passed: 7, failed: 3, skipped: 3, total: 13 }));
  test("parses task JSON with visible/hidden groups and categories", () => {
    const parsed = parseVerificationOutput("verify --json", JSON.stringify({ summary: { passed: 5, failed: 2 }, visible: { passed: 2, failed: 0 }, hidden: { passed: 3, failed: 2 }, failureCategories: ["edge-case"] }));
    expect(parsed).toMatchObject({ format: "json", passed: 5, failed: 2, total: 7, visible: { passed: 2, failed: 0 }, hidden: { passed: 3, failed: 2 }, failureCategories: ["edge-case"] });
  });
  test("leaves exit-code-only tasks unstructured", () => expect(parseVerificationOutput("./verify.sh", "all good")).toBeUndefined());
});
