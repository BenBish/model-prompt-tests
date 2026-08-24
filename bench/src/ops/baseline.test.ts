import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { currentBaseline, promoteBaseline, readBaselines } from "./baseline";

test("baseline promotion is explicit, immutable, and auditable", () => {
  const root = mkdtempSync(join(tmpdir(), "bench-baseline-")); const path = join(root, "audit.jsonl");
  try {
    promoteBaseline(path, { suite: "nightly", experimentId: "exp_one", promotedAt: "2026-01-01T00:00:00Z", promotedBy: "ci", reason: "approved" });
    promoteBaseline(path, { suite: "nightly", experimentId: "exp_two", promotedAt: "2026-01-02T00:00:00Z", promotedBy: "ben", reason: "paired win" });
    expect(currentBaseline(readBaselines(path), "nightly")?.experimentId).toBe("exp_two");
    expect(() => promoteBaseline(path, { suite: "x", experimentId: "batch-1", promotedAt: "now", promotedBy: "me", reason: "x" })).toThrow("immutable");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
