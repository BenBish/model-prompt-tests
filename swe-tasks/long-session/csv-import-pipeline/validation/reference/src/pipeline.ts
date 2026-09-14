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

export function validateRow(row: RawRow): string | undefined {
  if (!row.email) return "missing email";
  if (!row.name) return "missing name";
  const date = new Date(row.signupDate);
  if (Number.isNaN(date.getTime())) return "invalid signupDate";
  if (row.plan && !VALID_PLANS.includes(row.plan)) return "invalid plan";
  return undefined;
}

export function transformRow(row: RawRow): ParsedRecord {
  return {
    email: row.email.trim().toLowerCase(),
    name: row.name.trim(),
    signupDate: new Date(row.signupDate),
    plan: row.plan ? row.plan : "free",
  };
}

export function dedupeRecords(records: ParsedRecord[]): ParsedRecord[] {
  const byEmail = new Map<string, ParsedRecord>();
  for (const record of records) {
    const existing = byEmail.get(record.email);
    if (!existing || record.signupDate.getTime() > existing.signupDate.getTime()) {
      byEmail.set(record.email, record);
    }
  }
  return [...byEmail.values()];
}

export function runImport(csvText: string): ImportResult {
  const rows = parseCsv(csvText);
  const skipped: SkippedRow[] = [];
  const transformed: ParsedRecord[] = [];
  for (const row of rows) {
    const reason = validateRow(row);
    if (reason) {
      skipped.push({ row, reason });
      continue;
    }
    transformed.push(transformRow(row));
  }
  return { imported: dedupeRecords(transformed), skipped };
}
