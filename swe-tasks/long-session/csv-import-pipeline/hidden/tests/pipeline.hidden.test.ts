import { expect, test } from "bun:test";
import { runImport, transformRow, validateRow } from "../src/pipeline";

test("validateRow rejects a missing name, an unparseable date, and an invalid plan", () => {
  expect(validateRow({ email: "a@x.com", name: "", signupDate: "2026-01-01", plan: "free" })).toBeDefined();
  expect(
    validateRow({ email: "a@x.com", name: "Ada", signupDate: "not-a-date", plan: "free" }),
  ).toBeDefined();
  expect(
    validateRow({ email: "a@x.com", name: "Ada", signupDate: "2026-01-01", plan: "gold" }),
  ).toBeDefined();
  expect(
    validateRow({ email: "a@x.com", name: "Ada", signupDate: "2026-01-01", plan: "" }),
  ).toBeUndefined();
});

test("transformRow normalizes email case/whitespace and defaults a blank plan", () => {
  const record = transformRow({
    email: "  Ada@Example.com ",
    name: " Ada ",
    signupDate: "2026-01-01",
    plan: "",
  });
  expect(record.email).toBe("ada@example.com");
  expect(record.name).toBe("Ada");
  expect(record.plan).toBe("free");
  expect(record.signupDate.getUTCFullYear()).toBe(2026);
});

test("runImport keeps only the most recent record for a duplicate email", () => {
  const csv = [
    "email,name,signupDate,plan",
    "a@x.com,Ada,2026-01-01,free",
    "A@X.com,Ada Newname,2026-06-01,pro",
  ].join("\n");
  const result = runImport(csv);
  expect(result.imported).toHaveLength(1);
  expect(result.imported[0]?.plan).toBe("pro");
  expect(result.imported[0]?.name).toBe("Ada Newname");
});

test("runImport records skip reasons for invalid rows without throwing", () => {
  const csv = [
    "email,name,signupDate,plan",
    ",NoEmail,2026-01-01,free",
    "b@x.com,Bob,2026-01-02,free",
  ].join("\n");
  const result = runImport(csv);
  expect(result.imported.map((r) => r.email)).toEqual(["b@x.com"]);
  expect(result.skipped).toHaveLength(1);
  expect(result.skipped[0]?.reason).toBeTruthy();
});
