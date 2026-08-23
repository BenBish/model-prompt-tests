export type VerifierFormat = "bun" | "tap" | "junit" | "json" | "pytest";
export interface VerificationGroup { passed: number; failed: number; skipped?: number; }
export interface VerificationDetail extends VerificationGroup {
  format: VerifierFormat; total: number; visible?: VerificationGroup; hidden?: VerificationGroup;
  failureCategories: string[];
}
function detail(format: VerifierFormat, passed: number, failed: number, skipped = 0,
  extra: Partial<VerificationDetail> = {}): VerificationDetail | undefined {
  if (![passed, failed, skipped].every(Number.isFinite) || passed + failed + skipped <= 0) return undefined;
  return { format, passed, failed, skipped, total: passed + failed + skipped, failureCategories: [], ...extra };
}
function parseBun(command: string, output: string): VerificationDetail | undefined {
  if (!/(^|\s)bun\s+test\b/.test(command.trim().toLowerCase())) return undefined;
  const passed = Number(output.match(/^\s*(\d+)\s+pass\b/m)?.[1] ?? 0);
  const failed = Number(output.match(/^\s*(\d+)\s+fail\b/m)?.[1] ?? 0);
  const skipped = Number(output.match(/^\s*(\d+)\s+skip\b/m)?.[1] ?? 0);
  return detail("bun", passed, failed, skipped);
}
function parsePytest(command: string, output: string): VerificationDetail | undefined {
  if (!/(^|\s)(pytest|python\S*\s+-m\s+pytest)\b/.test(command.trim().toLowerCase())) return undefined;
  const matches = [...output.matchAll(/(\d+)\s+(passed|failed|errors?|skipped|xfailed|xpassed)/gi)];
  if (!matches.length) return undefined;
  let passed = 0, failed = 0, skipped = 0; const categories = new Set<string>();
  for (const [, countText, raw] of matches) { const count = Number(countText), kind = raw!.toLowerCase();
    if (kind === "passed" || kind === "xpassed") passed += count;
    else if (kind === "skipped" || kind === "xfailed") skipped += count;
    else { failed += count; categories.add(kind.startsWith("error") ? "error" : "assertion"); }
  }
  return detail("pytest", passed, failed, skipped, { failureCategories: [...categories] });
}
function parseTap(command: string, output: string): VerificationDetail | undefined {
  if (!/\btap\b|node\s+--test/.test(command.toLowerCase()) && !/^TAP version \d+/m.test(output)) return undefined;
  const lines = output.split(/\r?\n/).filter((line) => /^\s*(not )?ok\b/.test(line));
  if (!lines.length) return undefined;
  const failed = lines.filter((line) => /^\s*not ok\b/.test(line)).length;
  const skipped = lines.filter((line) => /#\s*SKIP\b/i.test(line)).length;
  return detail("tap", lines.length - failed - skipped, failed, skipped, { failureCategories: failed ? ["assertion"] : [] });
}
function parseJunit(command: string, output: string): VerificationDetail | undefined {
  if (!/junit|surefire|mvn\s+test|gradle\w*\s+test/.test(command.toLowerCase()) && !/<testsuite\b/.test(output)) return undefined;
  const suites = [...output.matchAll(/<testsuite\b([^>]*)>/g)]; if (!suites.length) return undefined;
  let total = 0, failed = 0, skipped = 0;
  for (const [, attrs] of suites) { const value = (name: string) => Number(attrs!.match(new RegExp(`\\b${name}=["'](\\d+)`))?.[1] ?? 0);
    total += value("tests"); failed += value("failures") + value("errors"); skipped += value("skipped"); }
  return detail("junit", total - failed - skipped, failed, skipped, { failureCategories: failed ? ["test-failure"] : [] });
}
function group(value: unknown): VerificationGroup | undefined {
  if (!value || typeof value !== "object") return undefined; const obj = value as Record<string, unknown>;
  const passed = Number(obj.passed ?? obj.testsPassed ?? 0), failed = Number(obj.failed ?? obj.testsFailed ?? obj.failures ?? obj.errors ?? 0), skipped = Number(obj.skipped ?? 0);
  return [passed, failed, skipped].every(Number.isFinite) ? { passed, failed, skipped } : undefined;
}
function parseJson(command: string, output: string): VerificationDetail | undefined {
  if (!/json/.test(command.toLowerCase()) && !/^\s*[{[]/.test(output)) return undefined;
  let parsed: unknown; try { parsed = JSON.parse(output); } catch { return undefined; }
  if (Array.isArray(parsed)) { const statuses = parsed.map((item) => String(item?.status ?? ""));
    return detail("json", statuses.filter((s) => /pass|ok|success/i.test(s)).length, statuses.filter((s) => /fail|error/i.test(s)).length, statuses.filter((s) => /skip|todo/i.test(s)).length); }
  const obj = parsed as Record<string, unknown>, totals = group(obj.summary ?? obj); if (!totals) return undefined;
  const categories = Array.isArray(obj.failureCategories) ? obj.failureCategories.filter((x): x is string => typeof x === "string") : [];
  return detail("json", totals.passed, totals.failed, totals.skipped, { visible: group(obj.visible), hidden: group(obj.hidden), failureCategories: categories });
}
/** Unknown and exit-code-only verifiers intentionally return undefined. */
export function parseVerificationOutput(command: string, output: string): VerificationDetail | undefined {
  return parseJson(command, output) ?? parseJunit(command, output) ?? parsePytest(command, output) ?? parseBun(command, output) ?? parseTap(command, output);
}
export function parseBunTestSummary(command: string, output: string): { testsPassed: number; testsTotal: number } | undefined {
  const parsed = parseBun(command, output); return parsed ? { testsPassed: parsed.passed, testsTotal: parsed.total } : undefined;
}
