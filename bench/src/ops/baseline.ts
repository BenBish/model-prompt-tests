import { appendFileSync, existsSync, readFileSync } from "node:fs";

export interface BaselineReference { suite: string; experimentId: string; promotedAt: string; promotedBy: string; reason: string }
export function readBaselines(path: string): BaselineReference[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as BaselineReference);
}
export function currentBaseline(records: BaselineReference[], suite: string): BaselineReference | undefined {
  return records.filter((record) => record.suite === suite).at(-1);
}
export function promoteBaseline(path: string, record: BaselineReference): void {
  if (!record.experimentId.startsWith("exp_")) throw new Error("baseline must be an immutable exp_ experiment id");
  if (!record.suite.trim() || !record.promotedBy.trim() || !record.reason.trim()) throw new Error("suite, promotedBy, and reason are required");
  appendFileSync(path, `${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "a" });
}
