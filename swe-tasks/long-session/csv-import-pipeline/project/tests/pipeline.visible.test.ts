import { expect, test } from "bun:test";
import { parseCsv, runImport } from "../src/pipeline";

test("parseCsv splits header-keyed rows", () => {
  const rows = parseCsv("email,name,signupDate,plan\na@x.com,Ada,2026-01-01,pro");
  expect(rows).toEqual([{ email: "a@x.com", name: "Ada", signupDate: "2026-01-01", plan: "pro" }]);
});

test("runImport imports well-formed rows with no duplicates", () => {
  const csv = [
    "email,name,signupDate,plan",
    "a@x.com,Ada,2026-01-01,pro",
    "b@x.com,Bob,2026-01-02,free",
  ].join("\n");
  const result = runImport(csv);
  expect(result.skipped).toEqual([]);
  expect(result.imported.map((r) => r.email)).toEqual(["a@x.com", "b@x.com"]);
});
