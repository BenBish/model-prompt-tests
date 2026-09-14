export interface RawRow {
  email: string;
  name: string;
  signupDate: string;
  plan: string;
}

export interface ParsedRecord {
  email: string;
  name: string;
  signupDate: Date;
  plan: string;
}

export interface SkippedRow {
  row: RawRow;
  reason: string;
}

export interface ImportResult {
  imported: ParsedRecord[];
  skipped: SkippedRow[];
}

const REQUIRED_HEADERS = ["email", "name", "signupDate", "plan"];
const VALID_PLANS = ["free", "pro", "enterprise"];

/** Stage 1, already implemented: splits CSV text into header-keyed rows. Do not change. */
export function parseCsv(csvText: string): RawRow[] {
  const lines = csvText.trim().split(/\r?\n/);
  const headers = lines[0]!.split(",").map((h) => h.trim());
  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) {
      throw new Error(`missing required column: ${required}`);
    }
  }
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = (cells[i] ?? "").trim();
    });
    return row as unknown as RawRow;
  });
}

/**
 * Stage 2: validate a raw row. Return an error reason string if the row should be skipped, or
 * undefined if it's good to proceed to transformRow.
 *
 * TODO: currently only checks for a missing email. Still needs to reject a missing name, a
 * signupDate that doesn't parse to a valid date, and a plan that is present but not one of
 * VALID_PLANS. A blank plan is allowed here - transformRow defaults it later.
 */
export function validateRow(row: RawRow): string | undefined {
  if (!row.email) return "missing email";
  return undefined;
}

/**
 * Stage 3: turn a validated raw row into a ParsedRecord.
 *
 * TODO: not implemented yet. Must: lowercase and trim the email, trim the name, parse
 * signupDate into a Date, and default an empty plan to "free".
 */
export function transformRow(_row: RawRow): ParsedRecord {
  throw new Error("not implemented");
}

/**
 * Stage 4: remove duplicate accounts by email (transformRow has already normalized case/
 * whitespace by this point). When the same email appears more than once, keep only the record
 * with the most recent signupDate.
 *
 * TODO: not implemented yet.
 */
export function dedupeRecords(_records: ParsedRecord[]): ParsedRecord[] {
  throw new Error("not implemented");
}

/**
 * Stage 5: run the full pipeline end to end - parse, validate (recording skipped rows with a
 * reason instead of throwing), transform, then dedupe.
 *
 * TODO: not implemented yet.
 */
export function runImport(_csvText: string): ImportResult {
  throw new Error("not implemented");
}
