const BUN_TEST_COMMAND = /^bun\s+test\b/;
const PASS_LINE = /^\s*(\d+)\s+pass\b/m;
const FAIL_LINE = /^\s*(\d+)\s+fail\b/m;

export interface TestCounts {
  testsPassed: number;
  testsTotal: number;
}

/**
 * Parses bun test's trailing text summary (e.g. " 3 pass\n 6 fail\n...") into pass/total counts.
 * Only bun test output is currently supported; other verify commands return undefined so callers
 * degrade gracefully to the binary pass/fail signal.
 */
export function parseBunTestSummary(command: string, output: string): TestCounts | undefined {
  if (!BUN_TEST_COMMAND.test(command.trim())) return undefined;

  const passMatch = output.match(PASS_LINE);
  const failMatch = output.match(FAIL_LINE);
  if (!passMatch && !failMatch) return undefined;

  const testsPassed = passMatch ? Number(passMatch[1]) : 0;
  const testsFailed = failMatch ? Number(failMatch[1]) : 0;
  return { testsPassed, testsTotal: testsPassed + testsFailed };
}
